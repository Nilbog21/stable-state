-- release-4 consolidated functions (#1629). One final definition per function created or
-- replaced across the squashed 62, ordered so each one's callees already exist. A function
-- first defined in the #657 baseline or the #972 release-3 set appears here as the
-- CREATE OR REPLACE release-4 gave it. Every REVOKE/GRANT pair lives in the companion
-- ..._release4_rls.sql, which sorts after this file.

-- ===========================================================================
-- Horse ownership and privilege helpers. auth_is_horse_owner first: both privilege helpers
-- score an owner through it, and auth_lesson_has_privileged_horse calls
-- auth_has_horse_lesson_read_privilege in turn.
-- #1547: a horse's owning member gets document write and lesson read on their own horse,
-- without needing a separate member_horse_privileges grant.
--
-- Both #997 helpers read member_horse_privileges and nothing else, so an owner scored 'none' /
-- false on their own horse and the horse detail page's Documents section was unreachable for them
-- entirely (found walking as a verified owner in the 2026-08-16 checklist run). Ownership already
-- implies write access to feed/medication notes (update_horse_notes, #1006) and to the photo
-- (update_horse_photo, #1003), which made the documents split an undocumented asymmetry rather
-- than a policy.
--
-- One new helper serves all three new call sites -- the two replacements below and
-- horse_documents_delete_ownership in the companion RLS migration -- rather than three copies of
-- the same join. SECURITY DEFINER for the same recursion-safety reason as auth_is_enrolled_rider:
-- it is called from policies on horse_documents and storage.objects, and reads horses and
-- barn_memberships, both of which carry policies of their own.
--
-- Role-blind by design, matching update_horse_notes'/update_horse_photo's owner branches: a
-- trainer or manager who owns the horse is admitted on the same basis as a rider. A horse with
-- owning_member_id IS NULL matches no row, so it returns false.
CREATE FUNCTION public.auth_is_horse_owner(p_horse_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.horses h
    JOIN public.barn_memberships bm ON bm.id = h.owning_member_id
    WHERE h.id = p_horse_id AND h.barn_id = p_barn_id
      AND bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
  );
$$;

-- Ownership short-circuits to 'write', the top of the privilege ladder, so an owner needs no
-- privileges row at all; a non-owner keeps the original lookup unchanged. Body-only amendment,
-- so the #1359 storage policies (rider_horse_documents_select/_insert) and the two horse_documents
-- table policies that call this inherit the ownership branch with no edit of their own.
CREATE OR REPLACE FUNCTION public.auth_get_horse_document_privilege(p_horse_id uuid, p_barn_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.auth_is_horse_owner(p_horse_id, p_barn_id) THEN 'write'
    ELSE COALESCE(
      (SELECT mhp.document_privileges
       FROM public.barn_memberships bm
       JOIN public.member_horse_privileges mhp
         ON mhp.member_id = bm.id AND mhp.horse_id = p_horse_id AND mhp.barn_id = p_barn_id
       WHERE bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
       LIMIT 1),
      'none'
    )
  END;
$$;

-- Same blind spot, same fix: an owner sees their own horse's schedule (Upcoming Lessons on the
-- horse detail page, and the exhaustion figures get_horse_projected_exhaustion gates on this)
-- without a grant. set_horse_owner still elevates an existing grant row's lesson_read_privileges,
-- which is now bookkeeping in the Access table rather than the thing that confers access.
CREATE OR REPLACE FUNCTION public.auth_has_horse_lesson_read_privilege(p_horse_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_horse_owner(p_horse_id, p_barn_id) OR EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    JOIN public.member_horse_privileges mhp ON mhp.member_id = bm.id
    WHERE bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
      AND mhp.horse_id = p_horse_id AND mhp.barn_id = p_barn_id
      AND mhp.lesson_read_privileges = true
  );
$$;

-- #997: fully encapsulates the lessons/lesson_riders → lesson_horses join
-- inside a single SECURITY DEFINER function, mirroring auth_is_enrolled_rider
-- rather than leaving an inline cross-table subquery in the RLS policy
-- itself — keeps the same recursion-safety guarantee if a future migration
-- ever adds a lesson_horses policy that references lessons/lesson_riders.
CREATE FUNCTION public.auth_lesson_has_privileged_horse(p_lesson_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lesson_horses lh
    WHERE lh.lesson_id = p_lesson_id AND lh.barn_id = p_barn_id
      AND public.auth_has_horse_lesson_read_privilege(lh.horse_id, p_barn_id)
  );
$$;

-- ===========================================================================
-- #1005/#1001/#998: update_horse_details reaches 12 params. The DROP targets the 8-param
-- release-3 signature this set starts from -- the 10- and 11-param intermediates the squashed
-- history stepped through never existed here. p_feed_notes/p_medication_notes/
-- p_registered_name/p_owning_member_id are written as-given (including NULL, which clears
-- them) rather than COALESCE'd like p_name.
DROP FUNCTION public.update_horse_details(uuid, uuid, text, boolean, boolean, text, int, int);

CREATE FUNCTION update_horse_details(
  p_horse_id uuid,
  p_barn_id uuid,
  p_name text,
  p_is_active boolean,
  p_is_available boolean,
  p_unavailability_reason text,
  p_exhaustion_threshold_moderate int DEFAULT NULL,
  p_exhaustion_threshold_high int DEFAULT NULL,
  p_feed_notes text DEFAULT NULL,
  p_medication_notes text DEFAULT NULL,
  p_registered_name text DEFAULT NULL,
  p_owning_member_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE horses
  SET name = COALESCE(p_name, name),
      is_active = p_is_active,
      is_available = p_is_available,
      unavailability_reason = p_unavailability_reason,
      deactivated_at = CASE
        WHEN horses.is_active = p_is_active THEN horses.deactivated_at
        WHEN p_is_active THEN NULL
        ELSE now()
      END,
      exhaustion_threshold_moderate = p_exhaustion_threshold_moderate,
      exhaustion_threshold_high = p_exhaustion_threshold_high,
      feed_notes = p_feed_notes,
      medication_notes = p_medication_notes,
      registered_name = p_registered_name,
      owning_member_id = p_owning_member_id
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;

-- #1001: get_horse_exertion_summary gains registered_name so the Horses list
-- page (which reads this RPC, not the raw table, for manager/trainer callers)
-- can render it on HorseCard alongside the barn name.
DROP FUNCTION public.get_horse_exertion_summary(uuid, timestamptz);

CREATE FUNCTION get_horse_exertion_summary(p_barn_id uuid, p_target_date timestamptz)
RETURNS TABLE (
  id                            uuid,
  name                          text,
  registered_name               text,
  is_active                     boolean,
  is_available                  boolean,
  unavailability_reason         text,
  exhaustion_threshold_high     int,
  exhaustion_threshold_moderate int,
  lesson_count                  bigint,
  total_exertion                bigint,
  jumping_count                 bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.name,
    h.registered_name,
    h.is_active,
    h.is_available,
    h.unavailability_reason,
    h.exhaustion_threshold_high,
    h.exhaustion_threshold_moderate,
    COALESCE(agg.lesson_count, 0)    AS lesson_count,
    COALESCE(agg.total_exertion, 0)  AS total_exertion,
    COALESCE(agg.jumping_count, 0)   AS jumping_count
  FROM horses h
  LEFT JOIN (
    SELECT
      lh.horse_id,
      COUNT(lh.lesson_id)::bigint                   AS lesson_count,
      SUM(lh.exertion_level)::bigint                AS total_exertion,
      COUNT(CASE WHEN l.jumping THEN 1 END)::bigint AS jumping_count
    FROM lesson_horses lh
    JOIN lessons l ON l.id = lh.lesson_id
                   AND l.barn_id = p_barn_id
                   AND l.lesson_at BETWEEN p_target_date - INTERVAL '3 days' AND p_target_date + INTERVAL '3 days'
                   AND l.cancelled_at IS NULL
    WHERE lh.barn_id = p_barn_id
    GROUP BY lh.horse_id
  ) agg ON agg.horse_id = h.id
  WHERE h.barn_id = p_barn_id
  ORDER BY h.name;
END;
$$;

-- #1003: lets a horse's owning member set/replace/delete its photo, alongside managers.
-- Write is dynamically locked once the *owner* uploads: a manager may only overwrite a
-- photo whose photo_uploaded_by is NULL or does not match the horse's current
-- owning_member_id. Runs SECURITY DEFINER because horses' own RLS grants column-blind
-- UPDATE to managers only -- there is no owner-write policy on the table itself.
CREATE FUNCTION public.update_horse_photo(
  p_horse_id uuid,
  p_barn_id uuid,
  p_photo_path text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
  v_role text;
  v_owning_member_id uuid;
  v_photo_uploaded_by uuid;
BEGIN
  SELECT id, role INTO v_membership_id, v_role
  FROM barn_memberships
  WHERE user_id = auth.uid() AND barn_id = p_barn_id AND status = 'active';

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT owning_member_id, photo_uploaded_by INTO v_owning_member_id, v_photo_uploaded_by
  FROM horses
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'horse_not_found';
  END IF;

  IF NOT (
    v_membership_id = v_owning_member_id
    OR (
      v_role = 'manager'
      AND (v_owning_member_id IS NULL OR v_photo_uploaded_by IS DISTINCT FROM v_owning_member_id)
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE horses
  SET photo_path = p_photo_path,
      photo_uploaded_by = CASE WHEN p_photo_path IS NULL THEN NULL ELSE v_membership_id END
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;

-- #1390: admits a barn manager alongside the owning member.
--
-- #1006 gave this function to the owning member alone because the manager already wrote the
-- same two columns through update_horse_details/HorseManagerForm. #1390 moves feed/medication
-- out of that form into its own Feed & Medication section, which every writer -- manager or
-- owner -- saves through this function, so the manager needs a branch here or the section is
-- read-only for the one role that owns the barn.
--
-- auth_is_barn_manager is the same helper every manager-gated policy uses; it is checked before
-- the ownership comparison so a manager who is not the owner passes on the first branch.
-- A trainer matches neither and still raises 'not_authorized' -- the horses table grants a
-- trainer SELECT only, and nothing about this change touches that.
--
-- Body-only change: signature, SECURITY DEFINER mode, search_path and grants are all as #1006
-- created them, so no REVOKE/GRANT is restated here.
CREATE OR REPLACE FUNCTION public.update_horse_notes(
  p_horse_id uuid,
  p_barn_id uuid,
  p_feed_notes text,
  p_medication_notes text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
  v_owning_member_id uuid;
BEGIN
  SELECT id INTO v_membership_id
  FROM barn_memberships
  WHERE user_id = auth.uid() AND barn_id = p_barn_id AND status = 'active';

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT owning_member_id INTO v_owning_member_id
  FROM horses
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'horse_not_found';
  END IF;

  IF NOT auth_is_barn_manager(p_barn_id)
     AND v_membership_id IS DISTINCT FROM v_owning_member_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE horses
  SET feed_notes = p_feed_notes,
      medication_notes = p_medication_notes
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;

-- #1549 (/testIssue round): transferring ownership leaves the outgoing owner a grant matching
-- the access ownership conferred them.
--
-- Until now the transfer was a silent revocation, and for exactly the grantless owner. Since
-- #1547 ownership confers document write and lesson read with no privileges row at all, and
-- createHorse assigns ownership without writing one -- which since #1549 is the *ordinary* state
-- of a horse rather than an edge case. The Access table synthesises that owner's row from
-- horses.owning_member_id, so the moment ownership moved the row had nothing left to stand on:
-- the outgoing owner disappeared from the table having lost every privilege they held, with
-- nothing on screen saying so.
--
-- Upsert rather than a plain INSERT because the outgoing owner may already hold a row -- a rider
-- granted access and then promoted keeps the one the promotion elevated. Writing 'write'/true on
-- both paths is what makes the outcome "the access they had *as owner*" in either case, rather
-- than whatever they happened to hold before being promoted.
--
-- This does not soften the privilege_grant_not_found raise below it. That guards the *incoming*
-- owner, whose grant row is still the precondition #998 established for reassignment; the row
-- written here is the outgoing owner's, which no caller was ever required to supply.
CREATE OR REPLACE FUNCTION public.set_horse_owner(p_horse_id uuid, p_barn_id uuid, p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_privilege_id uuid;
  v_previous_owner_id uuid;
BEGIN
  SELECT owning_member_id INTO v_previous_owner_id
  FROM horses
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  UPDATE horses
  SET owning_member_id = p_member_id
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  -- Guarded on the id rather than left to the upsert: re-tapping the selected Owner radio is
  -- already a no-op in setHorseOwnerAction, but a direct call passing the current owner would
  -- otherwise write the incoming owner's own grant here and make the raise below unreachable.
  IF v_previous_owner_id IS NOT NULL AND v_previous_owner_id <> p_member_id THEN
    INSERT INTO member_horse_privileges (
      barn_id, horse_id, member_id, document_privileges, lesson_read_privileges
    )
    VALUES (p_barn_id, p_horse_id, v_previous_owner_id, 'write', true)
    ON CONFLICT (barn_id, member_id, horse_id)
    DO UPDATE SET document_privileges = 'write', lesson_read_privileges = true;
  END IF;

  UPDATE member_horse_privileges
  SET document_privileges = 'write', lesson_read_privileges = true
  WHERE barn_id = p_barn_id AND horse_id = p_horse_id AND member_id = p_member_id
  RETURNING id INTO v_privilege_id;

  IF v_privilege_id IS NULL THEN
    -- Static token, matching update_horse_notes/update_horse_photo's 'horse_not_found': callers
    -- surface an RPC error's message verbatim via getErrorMessage, so ids must not be
    -- interpolated into it.
    RAISE EXCEPTION 'privilege_grant_not_found';
  END IF;
END;
$$;

-- revoke_horse_privilege: #998 had it clear owning_member_id alongside the row,
-- because back then ownership was *expressed* as an Access grant and revoking
-- the grant had to take the ownership with it. Since #1547 ownership stands on
-- its own -- auth_is_horse_owner confers document write and lesson read with no
-- privileges row at all -- so an owner who loses their grant keeps exactly the
-- access they had, and the Access table keeps showing them (the owner's row is
-- synthesised from horses.owning_member_id, grant or no grant).
--
-- Revoke is therefore hidden on the owner's row: the button would delete a row
-- nothing displays and leave the screen unchanged. Reassignment is how the
-- Owner column moves now.
CREATE OR REPLACE FUNCTION public.revoke_horse_privilege(p_privilege_id uuid, p_barn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM member_horse_privileges
  WHERE id = p_privilege_id AND barn_id = p_barn_id;
END;
$$;

-- ===========================================================================
-- Lessons.
-- #999 review follow-up: the companion rls file revokes table-wide SELECT on
-- lesson_riders.rider_notes/private_notes for
-- authenticated, but updateLessonRiderNotes still did .update(...).select().
-- single() with no explicit column list -- PostgREST turns that into an
-- implicit RETURNING *, and Postgres requires SELECT privilege on every
-- returned column, even ones the same statement just wrote. This RPC performs
-- a bare UPDATE with no RETURNING, so no column-level SELECT is ever needed.
-- SECURITY INVOKER (not DEFINER, unlike update_horse_notes): the existing
-- lesson_riders_update RLS policy already authorizes any active manager/
-- trainer in the barn to write these columns -- this function just needs to
-- run as the calling user so that policy still applies.
CREATE FUNCTION public.update_lesson_rider_notes(
  p_lesson_id uuid,
  p_rider_id uuid,
  p_barn_id uuid,
  p_rider_notes text,
  p_private_notes text
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE lesson_riders
  SET rider_notes = p_rider_notes,
      private_notes = p_private_notes
  WHERE lesson_id = p_lesson_id AND rider_id = p_rider_id AND barn_id = p_barn_id;
END;
$$;

-- #999 review follow-up: lesson_riders has a table-wide GRANT SELECT to
-- authenticated and its RLS policies (lesson_riders_select_staff/_select_rider/
-- _select_horse_privilege) are row-level only, so getLessonById's app-layer
-- masking of rider_notes/private_notes (select-string trimming + post-query
-- nulling) can't stop a caller with row visibility from reading every rider's
-- notes directly via PostgREST. Same fix shape as get_lesson_horse_exertion_levels
-- (#937/#999): the table-wide grant is revoked and re-granted minus these two
-- columns (companion RLS migration), making this RPC the only way to read them.
CREATE FUNCTION public.get_lesson_rider_notes(p_lesson_id uuid, p_barn_id uuid)
RETURNS TABLE (rider_id uuid, rider_notes text, private_notes text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lr.rider_id,
    CASE
      WHEN auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id) THEN lr.rider_notes
      WHEN lr.rider_id = (
        SELECT bm.id FROM barn_memberships bm
        WHERE bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
      ) THEN lr.rider_notes
      ELSE NULL
    END,
    CASE
      WHEN auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id) THEN lr.private_notes
      ELSE NULL
    END
  FROM lesson_riders lr
  WHERE lr.lesson_id = p_lesson_id AND lr.barn_id = p_barn_id
    AND (
      auth_is_barn_manager(p_barn_id)
      OR auth_is_barn_trainer(p_barn_id)
      OR auth_is_enrolled_rider(p_lesson_id, p_barn_id)
      OR auth_lesson_has_privileged_horse(p_lesson_id, p_barn_id)
    );
END;
$$;

-- #999: get_lesson_horse_exertion_levels gains a privileged-rider branch,
-- mirroring what #997 already did for get_horse_projected_exhaustion. Replaces
-- the manager/trainer-only RAISE EXCEPTION with a row-level filter, so a
-- rider only ever sees exertion for a horse they hold lesson_read_privileges
-- for -- not the whole lesson's horses. CREATE OR REPLACE keeps the function's
-- existing GRANT EXECUTE ... TO authenticated (release3_rls.sql), which
-- CREATE OR REPLACE never resets.
CREATE OR REPLACE FUNCTION public.get_lesson_horse_exertion_levels(p_lesson_id uuid, p_barn_id uuid)
RETURNS TABLE (horse_id uuid, exertion_level smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT lh.horse_id, lh.exertion_level
  FROM lesson_horses lh
  WHERE lh.lesson_id = p_lesson_id AND lh.barn_id = p_barn_id
    AND (
      auth_is_barn_manager(p_barn_id)
      OR auth_is_barn_trainer(p_barn_id)
      OR auth_has_horse_lesson_read_privilege(lh.horse_id, p_barn_id)
    );
END;
$$;

-- #1019: batch sibling of get_lesson_horse_exertion_levels.
--
-- lesson_horses.exertion_level has no SELECT grant to `authenticated` (#937 revoked the
-- table-wide grant and re-granted every column but this one), so that RPC is the only way
-- to read it. It takes a single p_lesson_id, which is one round trip per lesson -- fine for
-- the lesson detail page, not for the month conflict calendar, which decorates a whole
-- month's lessons at once. This variant takes the id array and returns lesson_id alongside
-- so one call covers the range.
--
-- Row filter is identical to get_lesson_horse_exertion_levels above (#999): manager/trainer
-- see every row, a rider sees only a horse they hold lesson_read_privileges for.
CREATE FUNCTION public.get_lesson_horse_exertion_levels_batch(p_lesson_ids uuid[], p_barn_id uuid)
RETURNS TABLE (lesson_id uuid, horse_id uuid, exertion_level smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT lh.lesson_id, lh.horse_id, lh.exertion_level
  FROM lesson_horses lh
  WHERE lh.lesson_id = ANY(p_lesson_ids) AND lh.barn_id = p_barn_id
    AND (
      auth_is_barn_manager(p_barn_id)
      OR auth_is_barn_trainer(p_barn_id)
      OR auth_has_horse_lesson_read_privilege(lh.horse_id, p_barn_id)
    );
END;
$$;

-- #1286: two aggregate/set-returning functions whose results feed a rendered list had no
-- ORDER BY, so their row order was whatever the planner produced. Both are CREATE OR REPLACE
-- with the body otherwise copied verbatim from their current definitions, so the existing
-- GRANT EXECUTE stays (CREATE OR REPLACE never resets it) and no signature changes.
--
-- 1. get_calendar_feed's jsonb_agg over the lesson/event UNION ALL — harmless to calendar
--    clients (they sort by DTSTART themselves), but any diff-based test of the feed would
--    otherwise be built on sand. Ordered chronologically, by start instant.
-- 2. get_horse_projected_exhaustion — ExhaustionBar renders one <li> per returned row,
--    showing the lesson's date. Same chronological ruling.
--
-- The name lists the app renders sort alphabetically instead (matching getHorsesByBarn's
-- ORDER BY h.name); those all live in TypeScript and need no migration. The inner string_agg
-- calls below were already ordered by name and are unchanged.

-- Ordering note (get_calendar_feed): both CTEs now carry the raw `starts_at` timestamptz
-- alongside the built jsonb object, and the aggregate orders on that column rather than on
-- item->>'startsAt'. Sorting the rendered text would only agree with chronological order
-- while every value happens to render at the same UTC offset, which is a property of the
-- session's TimeZone setting rather than of this function. `item->>'id'` breaks ties so a
-- lesson and an event at the same instant come out in a fixed order too.
CREATE OR REPLACE FUNCTION public.get_calendar_feed(p_token text)
RETURNS TABLE(valid boolean, barn_name text, items jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH resolved AS (
    SELECT bm.id AS membership_id, bm.barn_id, bm.role::text AS role
    FROM barn_memberships bm
    WHERE bm.calendar_feed_token = p_token AND bm.status = 'active'
  ),
  -- Unbounded query (no date range) — simplest correct thing today, barn lesson volume
  -- is small; add a rolling window if payload size becomes a real problem.
  lesson_items AS (
    SELECT l.lesson_at AS starts_at, jsonb_build_object(
      'itemType', 'lesson',
      'id', l.id,
      -- Compact title (fits a calendar grid cell): rider shown as "First L." for a normal
      -- lesson, since a normal lesson always has exactly one rider/horse (enforced by the
      -- deferred enforce_lesson_participant_counts() constraint trigger); group lessons
      -- just say "Group" rather than listing every rider/horse in the grid view.
      'title', 'Lesson - ' || CASE
        WHEN l.lesson_type = 'group' THEN 'Group'
        ELSE names.rider_initials || ', ' || names.horse_names
      END || CASE WHEN l.jumping THEN ' (Jumping)' ELSE '' END,
      'startsAt', l.lesson_at,
      -- hardcoded to match schedule.ts's LESSON_DURATION_MINUTES — SQL can't reference a
      -- TS constant, so keep the two in sync by hand if lesson duration ever becomes
      -- configurable.
      'durationMinutes', 60,
      -- Full detail for the DESCRIPTION field (shown on open, not in the grid): trainer
      -- name always included (even though a trainer already knows their own lessons, it's
      -- simpler to include it for every viewer than to special-case it away), full rider
      -- and horse lists for group lessons. Trainer line omitted (not "Unassigned") when
      -- instructor_id IS NULL, mirroring LessonListItem.tsx's own instructor_name display.
      'notes', array_to_string(
        array_remove(
          ARRAY[
            CASE WHEN names.trainer_name IS NOT NULL THEN 'Trainer: ' || names.trainer_name END,
            (CASE WHEN l.lesson_type = 'group' THEN 'Riders: ' ELSE 'Rider: ' END) || names.rider_names,
            (CASE WHEN l.lesson_type = 'group' THEN 'Horses: ' ELSE 'Horse: ' END) || names.horse_names
          ],
          NULL
        ),
        E'\n'
      )
    ) AS item
    FROM lessons l, resolved r,
    LATERAL (
      SELECT
        (
          SELECT tp.first_name || ' ' || tp.last_name
          FROM barn_memberships tbm
          JOIN profiles tp ON tp.id = tbm.profile_id
          WHERE tbm.id = l.instructor_id
        ) AS trainer_name,
        (
          SELECT string_agg(p.first_name || ' ' || p.last_name, ', ' ORDER BY p.first_name, p.last_name)
          FROM lesson_riders lr2
          JOIN barn_memberships bm2 ON bm2.id = lr2.rider_id
          JOIN profiles p ON p.id = bm2.profile_id
          WHERE lr2.lesson_id = l.id AND lr2.cancelled_at IS NULL
        ) AS rider_names,
        (
          SELECT string_agg(p.first_name || ' ' || left(p.last_name, 1) || '.', ', ' ORDER BY p.first_name, p.last_name)
          FROM lesson_riders lr2
          JOIN barn_memberships bm2 ON bm2.id = lr2.rider_id
          JOIN profiles p ON p.id = bm2.profile_id
          WHERE lr2.lesson_id = l.id AND lr2.cancelled_at IS NULL
        ) AS rider_initials,
        (
          SELECT string_agg(h.name, ', ' ORDER BY h.name)
          FROM lesson_horses lh2
          JOIN horses h ON h.id = lh2.horse_id
          WHERE lh2.lesson_id = l.id
        ) AS horse_names
    ) names
    WHERE l.barn_id = r.barn_id AND l.cancelled_at IS NULL
      AND (
        r.role = 'manager'
        OR (r.role = 'trainer' AND l.instructor_id = r.membership_id)
        -- rider sees own enrolled lessons plus, mirroring auth_lesson_has_privileged_horse
        -- (#997), any lesson involving a horse they hold lesson_read_privileges on — that
        -- helper checks auth.uid(), which is unavailable to this anon-token-authenticated
        -- caller, so the same join is inlined here against r.membership_id instead.
        OR (r.role = 'rider' AND (
              EXISTS (
                SELECT 1 FROM lesson_riders lr
                WHERE lr.lesson_id = l.id AND lr.rider_id = r.membership_id AND lr.cancelled_at IS NULL
              )
              OR EXISTS (
                SELECT 1 FROM lesson_horses lh
                JOIN member_horse_privileges mhp
                  ON mhp.horse_id = lh.horse_id AND mhp.barn_id = lh.barn_id
                WHERE lh.lesson_id = l.id AND lh.barn_id = r.barn_id
                  AND mhp.member_id = r.membership_id AND mhp.barn_id = r.barn_id
                  AND mhp.lesson_read_privileges = true
              )
            ))
      )
  ),
  event_items AS (
    SELECT e.event_at AS starts_at, jsonb_build_object(
      'itemType', 'event',
      'id', e.id,
      'title', e.title,
      'startsAt', e.event_at,
      'durationMinutes', 0,
      'notes', e.notes
    ) AS item
    FROM barn_events e, resolved r
    WHERE e.barn_id = r.barn_id AND (r.role = 'manager' OR r.role = ANY (e.visible_to_roles))
  )
  SELECT
    EXISTS (SELECT 1 FROM resolved) AS valid,
    (SELECT b.name FROM barns b JOIN resolved r ON b.id = r.barn_id) AS barn_name,
    COALESCE(
      (
        SELECT jsonb_agg(item ORDER BY starts_at, item->>'id')
        FROM (
          SELECT starts_at, item FROM lesson_items
          UNION ALL
          SELECT starts_at, item FROM event_items
        ) all_items
      ),
      '[]'::jsonb
    ) AS items;
$$;

-- Ordering note (get_horse_projected_exhaustion): ExhaustionBar lists the returned rows as
-- "<date> — <exertion>", so they read as a schedule and belong in chronological order.
-- Body is otherwise as #997 left it, when it added the third (privileged-rider)
-- authorization branch.
CREATE OR REPLACE FUNCTION public.get_horse_projected_exhaustion(
  p_horse_id UUID,
  p_barn_id UUID,
  p_target_date TIMESTAMPTZ,
  p_exclude_lesson_id UUID DEFAULT NULL
)
RETURNS TABLE (lesson_at TIMESTAMPTZ, exertion_level SMALLINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR auth_is_barn_trainer(p_barn_id)
    OR auth_has_horse_lesson_read_privilege(p_horse_id, p_barn_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT l.lesson_at, lh.exertion_level
  FROM lesson_horses lh
  JOIN lessons l ON l.id = lh.lesson_id AND l.barn_id = p_barn_id
  WHERE lh.horse_id = p_horse_id
    AND lh.barn_id = p_barn_id
    AND l.cancelled_at IS NULL
    AND l.lesson_at BETWEEN p_target_date - INTERVAL '3 days' AND p_target_date + INTERVAL '3 days'
    AND (p_exclude_lesson_id IS NULL OR l.id <> p_exclude_lesson_id)
  -- Ordered on the whole returned tuple, not `lesson_at` alone: a horse can hold two rows at
  -- one instant (nothing prevents double-booking), and their `exertion_level`s are what
  -- ExhaustionBar renders beside the shared date. Two rows agreeing on both columns are
  -- indistinguishable in the output, so this is as deterministic as the result set gets --
  -- the same reason get_calendar_feed above carries an `item->>'id'` tiebreak.
  ORDER BY l.lesson_at, lh.exertion_level;
END;
$$;

-- #1017 review fix: get_unread_notification_title accepted an arbitrary
-- p_type, so any active barn member could read any other member's unread
-- notification title for any NotificationType (outstanding_payment,
-- pending_approval, etc.), not just the instructor_lesson_nearby badge
-- count this RPC exists to serve. Restrict it to that one type.
CREATE OR REPLACE FUNCTION public.get_unread_notification_title(p_user_id uuid, p_barn_id uuid, p_type text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  IF p_type <> 'instructor_lesson_nearby' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT auth_is_active_barn_member(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT title INTO v_title
  FROM notifications
  WHERE user_id = p_user_id AND barn_id = p_barn_id AND type = p_type AND read_at IS NULL
  LIMIT 1;

  RETURN v_title;
END;
$$;

-- #1158: six SECURITY DEFINER functions carry no REVOKE … FROM PUBLIC / GRANT … TO
-- authenticated pair anywhere in the live migration set, so a from-scratch replay leaves them
-- with Postgres' default PUBLIC EXECUTE and reachable via PostgREST with the anon key.
--
-- Five are hardening-only. auth_is_barn_manager, auth_is_any_barn_manager,
-- auth_is_barn_trainer and auth_can_read_barn_member_profile are caller-scoped booleans over
-- auth.uid(), so PUBLIC EXECUTE buys an anon caller nothing — they are just inconsistent with
-- the ~20 later auth_* helpers that do carry the pair. set_instructor_cut had the pair in
-- migrations_archive/20260706005857_rpc_set_instructor_cut.sql, but the #972 squash re-listed
-- ~30 pairs in 20260716005944_release3_rls.sql and dropped this one; dev/prod retain the
-- pre-squash ACL (CREATE OR REPLACE does not reset grants), so it was replay-only, and its
-- in-body auth_is_barn_manager check rejects every non-manager caller regardless.
--
-- auth_get_profile_immutable_fields is the one that matters, and is live in prod today — it
-- never had a grant statement in any migration, including the archive. It is a bare
-- SELECT user_id, email, first_name, last_name, created_at FROM profiles WHERE id = p_id with
-- profiles RLS bypassed and no auth check of any kind, so it needs an in-body guard as well as
-- the grant: the grant alone would only narrow it from "anyone with the anon key" to "any
-- authenticated user", and a logged-in rider posting an arbitrary profile UUID at it would
-- still get an email back.

-- The guard is auth_can_read_barn_member_profile, the sibling SECURITY DEFINER helper already
-- backing profiles_barn_members_read, so the function's reach becomes exactly "profiles you
-- could already SELECT" — all it ever needed, since its job is breaking the
-- profiles-policy-queries-profiles recursion, not widening access. That helper is DEFINER over
-- barn_memberships and never touches profiles, so no recursion is reintroduced.
--
-- Its only live caller is profiles_manager_update's WITH CHECK
-- (20260716005944_release3_rls.sql), inside an expression that has already asserted the caller
-- is an active manager of a barn the target belongs to — so the guard rejects nothing
-- legitimate.
--
-- profiles_barn_members_read pairs the helper with an `auth.uid() = user_id` branch, for a user
-- reading their own profile from outside any barn. That branch is omitted here because it is
-- unreachable: profiles_manager_update requires is_managed = true, and claim_managed_member
-- sets user_id and is_managed = false in the same UPDATE, so an is_managed = true row always
-- has user_id IS NULL and `auth.uid() = user_id` can never hold for a row this helper is
-- reached for.
CREATE OR REPLACE FUNCTION public.auth_get_profile_immutable_fields(p_id uuid) RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT user_id, email, first_name, last_name, created_at
  FROM public.profiles
  WHERE id = p_id
    AND public.auth_can_read_barn_member_profile(p_id);
$$;

-- ===========================================================================
-- Appointments, cancellations and agreements.
-- #1148 function half; the table rename and appointment_costs itself are in the companion
-- schema file, and the money data's move in the companion backfills file.
--
-- The four RPCs keep their names: they are still the expense-writing entry points a manager
-- drives from /barn/[slug]/expenses, and renaming them would churn the DAL, the docs and
-- every grant for no behavioral gain.

-- sync_expense_transaction now owns the cost row as well as the ledger row. It already
-- upserted-or-deleted on exactly the p_amount IS NULL condition, from exactly the
-- (amount, payment_type) pair the cost row holds, so folding the cost write in keeps one
-- write path instead of duplicating it across both callers below. Its existing manager-only
-- check is already the gate appointment_costs' RLS wants.
CREATE OR REPLACE FUNCTION public.sync_expense_transaction(
  p_barn_id uuid, p_expense_id uuid, p_amount numeric, p_occurred_at timestamptz,
  p_payment_type payment_type_enum DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_amount IS NOT NULL THEN
    INSERT INTO appointment_costs (barn_id, appointment_id, amount, payment_type)
    VALUES (p_barn_id, p_expense_id, p_amount, p_payment_type)
    ON CONFLICT (appointment_id)
    DO UPDATE SET amount = EXCLUDED.amount, payment_type = EXCLUDED.payment_type;

    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, occurred_at, expense_id)
    VALUES (p_barn_id, 'expense', -p_amount, (p_payment_type IS NOT NULL), p_payment_type, p_occurred_at, p_expense_id)
    ON CONFLICT (expense_id) WHERE kind = 'expense'
    DO UPDATE SET amount = EXCLUDED.amount, collected = EXCLUDED.collected, payment_type = EXCLUDED.payment_type, occurred_at = EXCLUDED.occurred_at;
  ELSE
    -- Clearing an appointment back to unpriced drops both rows, so "no cost row" keeps
    -- meaning "not priced yet" for getOutstandingExpenses.
    DELETE FROM appointment_costs WHERE appointment_id = p_expense_id AND barn_id = p_barn_id;
    DELETE FROM transactions WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense';
  END IF;
END;
$$;

-- Both writers return the appointment row type, which CREATE OR REPLACE cannot retarget
-- from the (now nonexistent) horse_expenses composite type -- hence DROP and CREATE, with
-- the #829/#935-era grants re-applied at the bottom of this file.
DROP FUNCTION IF EXISTS create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz);

CREATE FUNCTION create_expense_with_horses(
  p_barn_id               uuid,
  p_expense_date          date,
  p_recipient             text,
  p_applies_to_all_horses boolean,
  p_expense_time          time    DEFAULT NULL,
  p_amount                numeric DEFAULT NULL,
  p_expense_type          text    DEFAULT 'Unspecified',
  p_notes                 text    DEFAULT NULL,
  p_horse_ids             uuid[]  DEFAULT NULL,
  p_payment_type          payment_type_enum DEFAULT NULL,
  -- #935: lets a caller pass a real local-aware instant instead of the naive
  -- (p_expense_date + p_expense_time)::timestamptz cast below, which is
  -- interpreted in the session's timezone (UTC) rather than the user's own.
  -- Defaults to NULL, in which case that exact naive derivation is used.
  p_occurred_at           timestamptz DEFAULT NULL
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appointment appointments;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO appointments (barn_id, expense_date, expense_time, recipient, expense_type, notes, applies_to_all_horses)
  VALUES (p_barn_id, p_expense_date, p_expense_time, p_recipient, p_expense_type, p_notes, p_applies_to_all_horses)
  RETURNING * INTO v_appointment;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO appointment_horses (barn_id, appointment_id, horse_id)
    SELECT p_barn_id, v_appointment.id, unnest(p_horse_ids);
  END IF;

  -- p_amount/p_payment_type are no longer columns on the row inserted above -- this call is
  -- now the only thing that persists them, into appointment_costs and the ledger both.
  PERFORM sync_expense_transaction(
    p_barn_id, v_appointment.id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_appointment;
END;
$$;

DROP FUNCTION IF EXISTS update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz);

CREATE FUNCTION update_expense_with_horses(
  p_expense_id            uuid,
  p_barn_id               uuid,
  p_expense_date          date,
  p_recipient             text,
  p_applies_to_all_horses boolean,
  p_expense_time          time    DEFAULT NULL,
  p_amount                numeric DEFAULT NULL,
  p_expense_type          text    DEFAULT 'Unspecified',
  p_notes                 text    DEFAULT NULL,
  p_horse_ids             uuid[]  DEFAULT NULL,
  p_payment_type          payment_type_enum DEFAULT NULL,
  -- #935: see create_expense_with_horses above.
  p_occurred_at           timestamptz DEFAULT NULL
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appointment appointments;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE appointments
  SET expense_date          = p_expense_date,
      expense_time          = p_expense_time,
      recipient             = p_recipient,
      expense_type          = p_expense_type,
      notes                 = p_notes,
      applies_to_all_horses = p_applies_to_all_horses
  WHERE id = p_expense_id AND barn_id = p_barn_id
  RETURNING * INTO v_appointment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found';
  END IF;

  DELETE FROM appointment_horses WHERE appointment_id = p_expense_id AND barn_id = p_barn_id;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO appointment_horses (barn_id, appointment_id, horse_id)
    SELECT p_barn_id, p_expense_id, unnest(p_horse_ids);
  END IF;

  PERFORM sync_expense_transaction(
    p_barn_id, p_expense_id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_appointment;
END;
$$;

-- #941, unchanged apart from the table name. The cost row needs no handling here: it hangs
-- off appointments by ON DELETE CASCADE, same as appointment_horses.
CREATE OR REPLACE FUNCTION public.delete_expense_with_transactions(
  p_expense_id uuid, p_barn_id uuid, p_delete_collected boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM transactions
  WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense' AND collected = false;

  IF p_delete_collected THEN
    DELETE FROM transactions
    WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense';
  END IF;

  DELETE FROM appointments WHERE id = p_expense_id AND barn_id = p_barn_id;
END;
$$;

-- #1278 — Group-lesson cancellation zeroed the wrong fees.
--
-- A lesson carries its fee in two places: lessons.fee and the single lesson_fee transaction
-- keyed on lesson_id. Both cancellation RPCs wrote `fee = 0` on a non-late cancel ungated on
-- lesson_type, then PERFORMed sync_rider_cancellation_fee, which returned early for anything
-- non-'normal' *before* the ledger half. Two defects fell out:
--
--   * A whole group lesson cancelled early read $0 on its detail page while its uncollected
--     lesson_fee transaction survived at the full amount, so the barn went on counting the
--     money as Pending income.
--   * One rider cancelling >24h out of a group lesson zeroed the *whole lesson's* fee, for a
--     lesson the remaining riders still rode.
--
-- A normal lesson always has exactly one rider (assert_lesson_participant_counts), so the
-- ungated write was correct there; it is only wrong once the type allows more than one.
--
-- cancel_lesson_with_transactions is deliberately untouched: its
-- `fee = CASE WHEN p_is_late THEN fee ELSE 0 END` is already right for both types, and the
-- helper change below is what makes its PERFORM clear the ledger for a group lesson too.

-- The early return narrows to *late* group cancellations, which keep both the column and the
-- ledger row. A non-late group cancellation now falls through to the same delete-uncollected /
-- zero-already-collected block a normal lesson takes. The rider_cancellation_fee INSERT further
-- down is gated on p_is_late, which this return makes unreachable for a non-'normal' lesson —
-- so that row stays normal-only without a second guard.
CREATE OR REPLACE FUNCTION public.sync_rider_cancellation_fee(
  p_barn_id uuid, p_lesson_id uuid, p_lesson_type lesson_type, p_is_late boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fee_txn transactions;
  v_lesson_rider_id uuid;
  v_instructor_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT instructor_id INTO v_instructor_id FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id;

    IF NOT (
      auth_is_barn_manager(p_barn_id)
      OR (auth_is_barn_trainer(p_barn_id) AND EXISTS (
        SELECT 1 FROM barn_memberships
        WHERE id = v_instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
      ))
      OR EXISTS (
        SELECT 1 FROM lesson_riders lr
        JOIN barn_memberships bm ON bm.id = lr.rider_id AND bm.barn_id = p_barn_id
        WHERE lr.lesson_id = p_lesson_id AND lr.barn_id = p_barn_id AND bm.user_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  IF p_lesson_type <> 'normal' AND p_is_late THEN
    RETURN;
  END IF;

  DELETE FROM transactions
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind = 'lesson_fee' AND collected = false
  RETURNING * INTO v_fee_txn;

  IF NOT FOUND THEN
    IF NOT p_is_late THEN
      UPDATE transactions
      SET amount = 0, payment_type = NULL, collected = true
      WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind = 'lesson_fee';
    END IF;
    RETURN;
  END IF;

  IF p_is_late THEN
    -- Reachable only for a normal lesson (see the early return above), which always has
    -- exactly 1 rider (assert_lesson_participant_counts).
    SELECT id INTO v_lesson_rider_id FROM lesson_riders WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id LIMIT 1;

    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, lesson_rider_id, occurred_at)
    VALUES (p_barn_id, 'rider_cancellation_fee', v_fee_txn.amount, false, NULL, v_lesson_rider_id, v_fee_txn.occurred_at);
  END IF;
END;
$$;

-- The remaining-active-rider count moves above the fee handling so the cascade is known before
-- anything decides. Both fee writes are whole-lesson-scoped, so they now fire only when this
-- cancellation ends the lesson: on a normal lesson (its one rider just left) or on a group
-- lesson whose last active rider just left. A group lesson that still has riders keeps its fee
-- and its ledger row untouched.
--
-- 'normal' implies the cascade in practice, but the type check stays explicit:
-- assert_lesson_participant_counts binds at creation, not here, and the guarantee wanted is
-- that normal-lesson behaviour is unchanged in every branch.
CREATE OR REPLACE FUNCTION public.cancel_rider_participation(
  p_lesson_id UUID,
  p_barn_id UUID,
  p_rider_id UUID,
  p_notes TEXT,
  p_is_late BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_instructor_id UUID;
  v_lesson_cancelled_at TIMESTAMPTZ;
  v_lesson_at TIMESTAMPTZ;
  v_lesson_type lesson_type;
  v_is_self BOOLEAN;
  v_is_instructor BOOLEAN;
  v_effective_is_late BOOLEAN;
  v_updated INT;
  v_remaining_active INT;
  v_cascaded BOOLEAN := false;
BEGIN
  SELECT instructor_id, cancelled_at, lesson_at, lesson_type
  INTO v_instructor_id, v_lesson_cancelled_at, v_lesson_at, v_lesson_type
  FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_not_found';
  END IF;

  IF v_lesson_cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'lesson_already_cancelled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = p_rider_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_self;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = v_instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_instructor;

  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR (auth_is_barn_trainer(p_barn_id) AND v_is_instructor)
    OR v_is_self
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_effective_is_late := CASE WHEN v_is_self THEN (v_lesson_at - now() <= INTERVAL '24 hours') ELSE p_is_late END;

  UPDATE lesson_riders
  SET cancelled_at = now(), cancellation_notes = p_notes
  WHERE lesson_id = p_lesson_id AND rider_id = p_rider_id AND barn_id = p_barn_id
    AND cancelled_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'rider_not_found_or_already_cancelled';
  END IF;

  SELECT count(*) INTO v_remaining_active
  FROM lesson_riders
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND cancelled_at IS NULL;

  v_cascaded := (v_remaining_active = 0);

  IF v_lesson_type = 'normal' OR v_cascaded THEN
    IF NOT v_effective_is_late THEN
      UPDATE lessons SET fee = 0 WHERE id = p_lesson_id AND barn_id = p_barn_id;
    END IF;

    PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson_type, v_effective_is_late);
  END IF;

  IF v_cascaded THEN
    UPDATE lessons SET cancelled_at = now() WHERE id = p_lesson_id AND barn_id = p_barn_id;
  END IF;

  RETURN v_cascaded;
END;
$$;

-- #1361: create_agreement_with_first_charge picked a charge's period — and defaulted
-- p_start_date — from `current_date`, which resolves in the DB session's zone (UTC on
-- Supabase), not the barn's. Every zone the barn picker offers is behind UTC, so an
-- agreement created in the last 4-10 hours of the barn's month was filed under the *next*
-- month. The write-side mirror of #1309/#1360's read-side fixes.
--
-- The function derives the barn's own day from `barns.timezone` itself rather than taking a
-- resolved period parameter: no signature change, so the existing grants survive CREATE OR
-- REPLACE (no companion RLS migration) and no caller can pass the wrong frame. `p_start_date`
-- moves from `DEFAULT current_date` to `DEFAULT NULL` + COALESCE for the same reason — a
-- DEFAULT expression can't see p_barn_id, so the barn-frame fallback has to live in the body.
-- Unchanged from the applied definition otherwise (20260716005943_release3_functions.sql).
CREATE OR REPLACE FUNCTION create_agreement_with_first_charge(
  p_barn_id    uuid,
  p_rider_id   uuid,
  p_horse_id   uuid,
  p_fee        numeric,
  p_kind       agreement_kind,
  p_cadence    agreement_cadence,
  p_start_date date DEFAULT NULL
)
RETURNS agreements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agreement agreements;
  v_today     date;
  v_period    date;
  v_charge_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT (now() AT TIME ZONE timezone)::date INTO v_today
  FROM barns WHERE id = p_barn_id;

  IF v_today IS NULL THEN
    RAISE EXCEPTION 'barn not found';
  END IF;

  INSERT INTO agreements (barn_id, rider_id, horse_id, fee, kind, cadence, start_date)
  VALUES (p_barn_id, p_rider_id, p_horse_id, p_fee, p_kind, p_cadence, COALESCE(p_start_date, v_today))
  RETURNING * INTO v_agreement;

  v_period := date_trunc('month', CASE WHEN v_agreement.cadence = 'monthly'
                                        THEN v_today
                                        ELSE v_agreement.start_date END)::date;

  INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
  VALUES (p_barn_id, v_agreement.id, v_period, p_fee)
  RETURNING id INTO v_charge_id;

  INSERT INTO transactions (barn_id, kind, amount, collected, membership_id, horse_id, occurred_at, agreement_charge_id)
  VALUES (
    p_barn_id,
    (CASE WHEN p_kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END)::transaction_kind,
    p_fee,
    false,
    p_rider_id,
    p_horse_id,
    v_period::timestamptz,
    v_charge_id
  );

  RETURN v_agreement;
END;
$$;

-- #1441: `update_agreement_charge_fee` updated the paired `transactions` row with no
-- `IF NOT FOUND` guard. Its sibling `mark_agreement_charge_paid` has raised
-- `charge_transaction_not_found` for exactly this case since #885 — on a charge missing its
-- transaction, the fee edit succeeded and left the agreement detail page and every income
-- report showing different numbers, with no error anywhere. Charges are born from RPCs that
-- write the charge and its transaction atomically, so this should only ever fire for a
-- genuinely inconsistent row; the point is the symmetry with the sibling.
--
-- Signature unchanged, so the grants from `20260716005944_release3_rls.sql` survive the
-- CREATE OR REPLACE and no companion RLS migration is needed.

CREATE OR REPLACE FUNCTION update_agreement_charge_fee(
  p_charge_id uuid,
  p_barn_id   uuid,
  p_fee       numeric
)
RETURNS agreement_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_charge agreement_charges;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE agreement_charges
  SET fee = p_fee
  WHERE id = p_charge_id AND barn_id = p_barn_id
  RETURNING * INTO v_charge;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'charge not found';
  END IF;

  UPDATE transactions
  SET amount = p_fee
  WHERE agreement_charge_id = p_charge_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'charge_transaction_not_found';
  END IF;

  RETURN v_charge;
END;
$$;

