-- release-4 consolidated RLS + grants (#1629). The final policy set the squashed 62 leave
-- behind, plus every table grant and every function REVOKE/GRANT pair they wrote. Sorts last
-- of the four, so a REVOKE here always follows the CREATE FUNCTION it guards -- the ordering
-- scripts/check-function-grants.sh enforces.

-- ===========================================================================
-- #997: RLS for member_horse_privileges (manager-only CRUD, barn-scoped) and
-- new rider-privilege policies on horse_documents/lessons/lesson_horses/
-- lesson_riders granting access via the helper functions in the companion
-- functions migration. All new SELECT policies below are additive —
-- Postgres OR-combines multiple permissive policies for the same command,
-- so existing manager/trainer/enrolled-rider access is unchanged.

ALTER TABLE public.member_horse_privileges ENABLE ROW LEVEL SECURITY;

CREATE POLICY manager_all_member_horse_privileges ON public.member_horse_privileges
  FOR ALL TO authenticated
  USING (public.auth_is_barn_manager(barn_id))
  WITH CHECK (public.auth_is_barn_manager(barn_id));

-- horse_documents: privileged rider read/write, additive to the existing
-- manager/trainer policies.
CREATE POLICY horse_documents_select_privilege ON public.horse_documents
  FOR SELECT TO authenticated
  USING (public.auth_get_horse_document_privilege(horse_id, barn_id) IN ('read', 'write'));

CREATE POLICY horse_documents_insert_privilege ON public.horse_documents
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_get_horse_document_privilege(horse_id, barn_id) = 'write');

-- lessons / lesson_horses / lesson_riders: privileged rider read, additive
-- to the existing staff/enrolled-rider SELECT policies.
CREATE POLICY lessons_select_horse_privilege ON public.lessons
  FOR SELECT TO authenticated
  USING (public.auth_lesson_has_privileged_horse(id, barn_id));

CREATE POLICY lesson_horses_select_horse_privilege ON public.lesson_horses
  FOR SELECT TO authenticated
  USING (public.auth_has_horse_lesson_read_privilege(horse_id, barn_id));

CREATE POLICY lesson_riders_select_horse_privilege ON public.lesson_riders
  FOR SELECT TO authenticated
  USING (public.auth_lesson_has_privileged_horse(lesson_id, barn_id));

REVOKE ALL ON FUNCTION public.auth_get_horse_document_privilege(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_get_horse_document_privilege(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_has_horse_lesson_read_privilege(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_has_horse_lesson_read_privilege(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_lesson_has_privileged_horse(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_lesson_has_privileged_horse(uuid, uuid) TO authenticated;

-- #1547: the delete half of "an owner gets full CRUD on their own horse's documents".
--
-- horse_documents had no privilege-based DELETE policy at all -- #997 defines SELECT and INSERT
-- only (above in this file) -- so this is a policy that has never existed rather than a widened one. Gated on
-- ownership directly, not on auth_get_horse_document_privilege() = 'write': the Access section's
-- three-way none/read/write control promises a granted rider reads and uploads, and nothing there
-- says anything about deletion. Additive, as ever -- Postgres OR-combines permissive policies, so
-- manager_all_horse_documents is unchanged.
CREATE POLICY horse_documents_delete_ownership ON public.horse_documents
  FOR DELETE TO authenticated
  USING (public.auth_is_horse_owner(horse_id, barn_id));

-- The storage half, which the table half is useless without: deleteHorseDocumentAction removes the
-- stored object after the row, and no policy on the documents bucket's horses/ prefix admitted a
-- non-manager to DELETE. That is exactly the gap #1359 closed for SELECT/INSERT, and it fails
-- quieter here -- the action already swallows a removeFile error, so every owner delete would have
-- orphaned its object with nothing surfaced. Managers keep deleting through manager_documents_all.
--
-- Path shape and the bare `name` reference match rider_horse_documents_select/_insert (#1359,
-- just below): [1] barn id, [2] the 'horses' prefix, [3] horse id, and a direct helper call
-- rather than an EXISTS subquery, so the objects.name shadowing bug #1003 fixed cannot arise
-- here.
CREATE POLICY rider_horse_documents_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horses'
  AND public.auth_is_horse_owner(
        ((storage.foldername(name))[3])::uuid,
        ((storage.foldername(name))[1])::uuid
      )
);

-- #1359: storage.objects policies admitting privilege-granted riders on the
-- documents bucket's horses/ prefix. #997/#999 granted the horse_documents
-- *table* to privileged riders (SELECT for 'read'/'write', INSERT for 'write',
-- above in this file) but no storage policy followed, so the horse detail page's
-- getSignedUrl threw on the RLS denial and the page 500'd for exactly the
-- riders the grant admitted. Additive only — Postgres OR-combines permissive
-- policies, so manager/trainer access is unchanged.
--
-- Both checks are direct calls to the SECURITY DEFINER helper the table
-- policies already use (recursion-safe, already granted to authenticated).
-- No EXISTS subquery means the objects.name shadowing bug #1003
-- fixed cannot arise here: the bare `name` below is unambiguously
-- storage.objects.name.

CREATE POLICY rider_horse_documents_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horses'
  AND public.auth_get_horse_document_privilege(
        ((storage.foldername(name))[3])::uuid,
        ((storage.foldername(name))[1])::uuid
      ) IN ('read', 'write')
);

CREATE POLICY rider_horse_documents_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horses'
  AND public.auth_get_horse_document_privilege(
        ((storage.foldername(name))[3])::uuid,
        ((storage.foldername(name))[1])::uuid
      ) = 'write'
);

-- ===========================================================================
-- #1014: RLS for barn_events. Manager gets unconditional CRUD; every active
-- barn member (including manager) gets SELECT filtered to rows where
-- visible_to_roles contains their own role. Plain subquery to
-- barn_memberships is safe here (no recursion) since this policy is defined
-- on barn_events, not on barn_memberships itself -- see ARCHITECTURE.md's
-- RLS conventions for the recursion class this would otherwise hit.

ALTER TABLE public.barn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY manager_all_barn_events ON public.barn_events
  FOR ALL TO authenticated
  USING (public.auth_is_barn_manager(barn_id))
  WITH CHECK (public.auth_is_barn_manager(barn_id));

CREATE POLICY barn_events_select_visible_role ON public.barn_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.barn_id = barn_events.barn_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (barn_events.visible_to_roles)
    )
  );

-- ===========================================================================
-- #1037: self-service join requests are dead (registration is invite-only since #777), so the
-- approve/reject policy has no callers left. The narrowed status CHECK sits in the backfills
-- file, next to the DELETE that makes it safe.
DROP POLICY barn_memberships_manager_approve ON public.barn_memberships;

-- ===========================================================================
-- Companion to get_lesson_rider_notes in the functions file (#999): Postgres
-- has no "all columns except this one" grant, so the table-wide SELECT grant on
-- lesson_riders is revoked and re-granted for every column except rider_notes/
-- private_notes -- those are readable only via get_lesson_rider_notes now, the
-- same pattern release3_rls.sql already applied to lesson_horses.exertion_level.
REVOKE SELECT ON TABLE public.lesson_riders FROM authenticated;
GRANT SELECT (id, barn_id, lesson_id, rider_id, cancellation_notes, cancelled_at) ON TABLE public.lesson_riders TO authenticated;

-- ===========================================================================
-- storage.objects, the documents bucket. manager_documents_all comes from the baseline and is
-- replaced once here, with both carve-outs (#1004's profile-photos, #1003's horse-photos)
-- already applied.
-- #1003: carve the horse-photos prefix out of the broad manager_documents_all grant
-- (same approach as #1004's profile-photos carve-out, below) and give it its own dynamically-locked policies -- a manager may write only
-- when the horse's photo isn't currently locked by its owner, and the owner may always
-- write their own horse's photo.
DROP POLICY manager_documents_all ON storage.objects;
CREATE POLICY manager_documents_all ON storage.objects TO authenticated USING (
  bucket_id = 'documents'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'profile-photos'
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'horse-photos'
) WITH CHECK (
  bucket_id = 'documents'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'profile-photos'
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'horse-photos'
);

-- Manager write on the new {barn_id}/horse-photos/{horse_id}/* prefix is already covered
-- by the existing manager_documents_all policy (FOR ALL, keyed only on foldername[1] =
-- barn_id). This adds the missing read: any active barn member (manager/trainer/rider),
-- matching horses' own barn-wide SELECT.
CREATE POLICY horse_photos_member_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'horse-photos'::text) AND public.auth_is_active_barn_member(((storage.foldername(name))[1])::uuid)));

-- #1004: storage.objects policies for the new {barn_id}/profile-photos/{profile_id}/*
-- prefix. barn_id is kept as the first path segment purely so the existing
-- manager_documents_all policy's ((storage.foldername(name))[1])::uuid cast (evaluated
-- against every row in this single-bucket table) never sees a non-UUID first segment.
--
-- Manager write for managed/stub profiles is already covered by manager_documents_all
-- (barn-scoped FOR ALL) — same as horse-photos (#1002). The is_managed-only
-- restriction on *which* profiles a manager may touch is enforced in the server action,
-- mirroring updateContactInfoAction's existing check, not carved into storage RLS.
CREATE POLICY profile_photos_self_write ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = ((storage.foldername(name))[3])::uuid
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = ((storage.foldername(name))[3])::uuid
      AND p.user_id = auth.uid()
  )
);

-- Read is scoped by profile-read authorization (auth_can_read_barn_member_profile), not by
-- the storage path's barn_id segment — a profile can be visible from a different barn than
-- the one its photo happened to be uploaded under (multi-barn members), unlike horses which
-- belong to exactly one barn.
CREATE POLICY profile_photos_member_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND public.auth_can_read_barn_member_profile(((storage.foldername(name))[3])::uuid)
);

CREATE POLICY profile_photos_manager_write ON storage.objects FOR ALL TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = ((storage.foldername(name))[3])::uuid
      AND p.is_managed = true
  )
) WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = ((storage.foldername(name))[3])::uuid
      AND p.is_managed = true
  )
);

-- #1003 review fix: horse_photos_manager_write/horse_photos_owner_write's EXISTS subqueries
-- referenced an unqualified `name`, which Postgres resolved to horses.name (the horse's own
-- name, e.g. 'Butter') instead of the intended outer storage.objects.name (the storage path) --
-- horses.name has no '/', so storage.foldername() on it always returned an empty array, making
-- both EXISTS clauses permanently false and blocking every horse-photo upload/replace, manager
-- or owner alike. Qualifies every foldername() call inside the subqueries as objects.name.

CREATE POLICY horse_photos_manager_write ON storage.objects FOR ALL TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.horses h
    WHERE h.id = ((storage.foldername(objects.name))[3])::uuid
      AND h.barn_id = ((storage.foldername(objects.name))[1])::uuid
      AND (h.owning_member_id IS NULL OR h.photo_uploaded_by IS DISTINCT FROM h.owning_member_id)
  )
) WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.horses h
    WHERE h.id = ((storage.foldername(objects.name))[3])::uuid
      AND h.barn_id = ((storage.foldername(objects.name))[1])::uuid
      AND (h.owning_member_id IS NULL OR h.photo_uploaded_by IS DISTINCT FROM h.owning_member_id)
  )
);

CREATE POLICY horse_photos_owner_write ON storage.objects FOR ALL TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND EXISTS (
    SELECT 1 FROM public.horses h
    JOIN public.barn_memberships bm ON bm.id = h.owning_member_id
    WHERE h.id = ((storage.foldername(objects.name))[3])::uuid
      AND h.barn_id = ((storage.foldername(objects.name))[1])::uuid
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
) WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND EXISTS (
    SELECT 1 FROM public.horses h
    JOIN public.barn_memberships bm ON bm.id = h.owning_member_id
    WHERE h.id = ((storage.foldername(objects.name))[3])::uuid
      AND h.barn_id = ((storage.foldername(objects.name))[1])::uuid
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
);

-- ===========================================================================
-- #1148 RLS half; the rename itself is in the companion schema file.
--
-- The two policies that predate release-4 are renamed rather than dropped and recreated. A
-- policy body is stored against the table's OID, so `USING (auth_is_barn_manager(barn_id))`
-- follows the table rename on its own -- a rename reaches the same end state as a
-- drop-and-recreate with no chance of the recreated body drifting from the original.
--
-- #1019's two trainer policies were born inside this squash, so there is no pre-rename name
-- for them to be renamed from: they are created under their final names further down, with
-- their USING clauses qualified `appointments`/`appointment_horses` rather than the
-- `horse_expenses`/`expense_horses` the original migration wrote.
ALTER POLICY "manager_all_horse_expenses" ON public.appointments
  RENAME TO "manager_all_appointments";

ALTER POLICY "manager_all_expense_horses" ON public.appointment_horses
  RENAME TO "manager_all_appointment_horses";

-- appointment_costs is manager-only, matching `transactions`: this table is the whole reason
-- the split exists, so a trainer reading it must come back empty rather than filtered by
-- column. RLS filters rows, and the authenticated table grant stays, so a trainer's SELECT
-- returns zero rows instead of erroring -- which is what lets expenses.ts hydrate costs with
-- one role-blind query (see attachCosts).
ALTER TABLE public.appointment_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager_all_appointment_costs" ON public.appointment_costs
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

-- #1019 review fix: trainers use the same New Lesson form as managers, and its
-- month conflict calendar marks days where a selected horse already has a lesson
-- OR an expense. Until now the expense half could never fire for a trainer --
-- horse_expenses/expense_horses each carried exactly one policy
-- (manager_all_*, FOR ALL USING (auth_is_barn_manager(barn_id))), so
-- getScheduleForRange (src/lib/db/schedule.ts) returned a trainer zero expense
-- rows silently, and USER_GUIDE_TRAINER.md described a dot its own audience
-- couldn't see. Barn-side guidance is that trainers should see vet/farrier
-- appointments.
--
-- Same role-membership idiom as lessons_select_staff/lesson_horses_select_staff
-- (release3_rls.sql), narrowed to role = 'trainer' -- manager_all_* already
-- covers managers, and riders stay excluded (their dashboard keeps returning no
-- expense items, unchanged).
--
-- Accepted tradeoff: RLS filters rows, not columns, so this also lets a trainer
-- read amount/notes/payment_type off these rows via a direct PostgREST/DAL call.
-- Postgres has no per-app-role column grant -- managers and trainers are both
-- `authenticated`, so the REVOKE-and-regrant-per-column trick #937 used on
-- lesson_horses.exertion_level can't discriminate between them here without
-- moving the manager's own expense reads behind a SECURITY DEFINER relay. No UI
-- surfaces those columns to a trainer: the dashboard filters to amount IS NULL
-- planned expenses, and every /barn/[slug]/expenses route is manager-gated.

CREATE POLICY "trainer_select_appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = appointments.barn_id
      AND status = 'active' AND role = 'trainer'
  ));

CREATE POLICY "trainer_select_appointment_horses" ON public.appointment_horses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = appointment_horses.barn_id
      AND status = 'active' AND role = 'trainer'
  ));

-- ===========================================================================
-- Function EXECUTE grants.
REVOKE ALL ON FUNCTION public.update_horse_photo(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_horse_photo(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.update_horse_notes(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_horse_notes(uuid, uuid, text, text) TO authenticated;

-- #1001 review fix: get_horse_exertion_summary was dropped and recreated in
-- the companion functions migration to add registered_name to its return
-- shape. DROP FUNCTION discards a function's ACL, so its EXECUTE grant must
-- be re-applied here the same way #936 did for this same function (see
-- 20260716005944_release3_rls.sql) — otherwise it silently reverts to
-- PUBLIC-executable.
REVOKE ALL ON FUNCTION get_horse_exertion_summary(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_horse_exertion_summary(uuid, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.update_lesson_rider_notes(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_lesson_rider_notes(uuid, uuid, uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_lesson_rider_notes(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_rider_notes(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_lesson_horse_exertion_levels_batch(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_horse_exertion_levels_batch(uuid[], uuid) TO authenticated;

-- #1018: get_calendar_feed is the one public function granted to `anon` -- /calendar.ics is
-- fetched by a calendar client with no session, authorized by the feed token alone.
REVOKE ALL ON FUNCTION public.get_calendar_feed(p_token text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_calendar_feed(p_token text) TO anon, authenticated;

REVOKE ALL ON FUNCTION get_unread_notification_title(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_unread_notification_title(uuid, uuid, text) TO authenticated;

-- #1017 review fix: get_unread_notification_title is called from
-- generate-recurring-lessons.ts's service-role client (see its auth.uid()
-- IS NULL bypass), but the prior grants migration only granted EXECUTE to
-- authenticated. Function EXECUTE privilege isn't covered by the baseline's
-- table-only ALTER DEFAULT PRIVILEGES rule, so the cron job's call was
-- failing with permission denied -- matching the fix already applied to
-- get_instructor_membership_names/get_active_barn_member_summaries/
-- sync_lesson_transactions.
GRANT EXECUTE ON FUNCTION get_unread_notification_title(uuid, uuid, text) TO service_role;

-- #1137: the e2e fixture builders plant already-cancelled lesson state with a service-role
-- client. cancel_lesson_with_transactions / cancel_rider_participation both raise
-- not_authorized for a NULL auth.uid(), so the builders replay those functions' table writes
-- directly — but the cancellation-fee ledger must stay owned by this function rather than be
-- reimplemented in a fixture that can drift from the real fee policy.
--
-- sync_rider_cancellation_fee already exempts a NULL-auth.uid() caller from its own
-- authorization check (the documented service-role-caller exception it shares with
-- sync_lesson_transactions); only the EXECUTE grant was missing. Same fix as
-- #1017's get_unread_notification_title grant above and #930's
-- get_outstanding_transactions grant. No new capability: service_role already bypasses RLS
-- and can write `transactions` directly.
GRANT EXECUTE ON FUNCTION public.sync_rider_cancellation_fee(uuid, uuid, lesson_type, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.auth_get_profile_immutable_fields(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_get_profile_immutable_fields(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_barn_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_barn_manager(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_any_barn_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_any_barn_manager() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_barn_trainer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_barn_trainer(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_can_read_barn_member_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_read_barn_member_profile(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_instructor_cut(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_instructor_cut(uuid, numeric) TO authenticated;

-- Re-applied for the two dropped-and-recreated functions only: a fresh CREATE carries the
-- default PUBLIC EXECUTE grant, which is the #829 anon-bypass bug (an unauthenticated
-- anon-key caller would sail through the `auth.uid() IS NULL` service-role branch).
REVOKE EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) TO authenticated, service_role;

-- #1535: nine non-trigger public functions carry no REVOKE … FROM PUBLIC anywhere in the live
-- migration set, so a from-scratch replay leaves them with Postgres' default PUBLIC EXECUTE and
-- reachable via PostgREST with the anon key. All nine are SECURITY INVOKER, so an anon caller
-- executes as `anon` and RLS rejects every write — this is hardening and consistency, not a live
-- hole. Two prod shapes, one root cause: four have proacl = null (never granted, never revoked),
-- five retain `=X` (granted to authenticated, PUBLIC never revoked).
--
-- The durable half of the fix is scripts/check-function-grants.sh, wired into scripts/ci.sh: it
-- fails when a CREATE/DROP has no REVOKE … FROM PUBLIC at or after it, which is what a squash
-- silently reopens. #972's squash dropped set_instructor_cut's pair exactly that way; #1158
-- restored it. Nobody should have to re-run this audit by hand.
--
-- Grant targets are not uniform. ALTER DEFAULT PRIVILEGES (20260629004612_baseline_rls.sql:291-292)
-- covers TABLES only, and #1017's get_unread_notification_title service_role grant above
-- exists because that gap broke a cron job's call — so a blanket "grant authenticated" here would
-- repeat that incident. Four of the nine are reached through scripts/script-utils.ts's
-- service-role client:
--
--   generate_lesson_for_series               scripts/generate-recurring-lessons.ts (nightly GHA cron)
--   create_lesson_with_participants          scripts/seed-barn.ts, e2e/support/fixtures.ts
--   create_lesson_series_with_participants   scripts/seed-barn.ts
--   assert_lesson_participant_counts         PERFORMed inside both create_lesson_* bodies
--
-- (The issue's sweep listed three, missing create_lesson_series_with_participants —
-- scripts/seed-barn.ts calls createLessonSeries, src/lib/db/lesson-series.ts's wrapper for it.
-- Granting per the issue as written would have broken reset-db.)
--
-- The remaining five are client-only: no scripts/*.ts or e2e/support/*.ts service-role path
-- imports a DAL wrapper that reaches them.

-- Reached by a service-role script as well as by clients.
REVOKE ALL ON FUNCTION public.assert_lesson_participant_counts(lesson_type, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_lesson_participant_counts(lesson_type, integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_lesson_series_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lesson_series_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.generate_lesson_for_series(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_lesson_for_series(uuid, uuid, timestamptz) TO authenticated, service_role;

-- Client-only.
REVOKE ALL ON FUNCTION public.update_lesson_with_participants(uuid, uuid, timestamptz, uuid, numeric, lesson_type, boolean, payment_type_enum, text, uuid[], integer[], uuid[], numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_lesson_with_participants(uuid, uuid, timestamptz, uuid, numeric, lesson_type, boolean, payment_type_enum, text, uuid[], integer[], uuid[], numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.update_horse_details(uuid, uuid, text, boolean, boolean, text, int, int, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_horse_details(uuid, uuid, text, boolean, boolean, text, int, int, text, text, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_horse_privilege(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_horse_privilege(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_horse_owner(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_horse_owner(uuid, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_default_tier(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_tier(uuid, uuid) TO authenticated;

-- ===========================================================================
-- Last of the four files, last block in it: the blanket service_role grant has to follow every
-- CREATE FUNCTION and every other grant above, exactly as it followed them in the squashed
-- history. A function's ACL is an ordered list and `pg_dump` renders it in grant order, so
-- hoisting this earlier would leave a set that is equivalent in reach but not identical in
-- text -- and identical text is what scripts/verify-migration-equivalence.sh proves.
-- #1546: restore service_role EXECUTE on the public functions #1535 silently cut off.
--
-- #1535 revoked EXECUTE from PUBLIC on nine invoker RPCs and granted `authenticated` back, naming
-- `service_role` on only four. Every *other* public function had been reachable by service-role
-- callers only through the PUBLIC grant it was never given explicitly — so the revoke removed
-- their access too: 39 of 58 public functions were left with no service_role EXECUTE. Surfaced by
-- the 2026-08-16 checklist run, whose service-role e2e fixture got `permission denied for function
-- set_horse_owner` and stopped the suite with 10 tests unverdicted.
--
-- App runtime was unaffected — its only service-role RPCs (teardown_dev_barn_lessons,
-- teardown_all_lesson_data) kept their grants. The blast radius was e2e fixtures and the
-- scripts/*.ts service-role clients.
--
-- The shape here mirrors what service_role already has for TABLES in
-- 20260629004612_baseline_rls.sql:291-292 — a blanket grant plus a default-privileges rule — so a
-- function added later is covered at creation rather than at the next incident. That gap is what
-- #1017's one-off service_role grant above was filed for, and what this closes for good.
--
-- Nothing is weakened: service_role already holds GRANT ALL ON ALL TABLES and bypasses RLS, so
-- function EXECUTE grants it no reach it lacked. The `authenticated` half is untouched and still
-- has to be reasoned about per function, as does every function's REVOKE … FROM PUBLIC —
-- scripts/check-function-grants.sh continues to enforce that half.

-- Covers the functions that exist at this point in the replay.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Covers every function created after it. `FOR ROLE postgres` matches the table rule verbatim:
-- default privileges are keyed on the creating role, so a different spelling here would be a
-- silent no-op.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- auth_is_horse_owner is the one function created after that rule in the squashed history, so
-- it picked up service_role at creation and `authenticated` only afterwards. Its pair sits
-- below the block above to reproduce that order.
-- Only the new function needs a pair: CREATE OR REPLACE preserves the existing ACL, so the two
-- amended helpers keep the grants #997 gave them at the top of this file (see
-- check-function-grants.sh's header).
REVOKE ALL ON FUNCTION public.auth_is_horse_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_horse_owner(uuid, uuid) TO authenticated;

