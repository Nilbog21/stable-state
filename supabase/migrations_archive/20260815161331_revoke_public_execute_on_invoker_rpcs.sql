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
-- covers TABLES only, and 20260723182521_nearby_instructor_unread_title_service_role_grant.sql
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
