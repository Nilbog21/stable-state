-- Companion to 20260725005003_lesson_rider_notes_privilege_functions.sql: Postgres
-- has no "all columns except this one" grant, so the table-wide SELECT grant on
-- lesson_riders is revoked and re-granted for every column except rider_notes/
-- private_notes -- those are readable only via get_lesson_rider_notes now, the
-- same pattern release3_rls.sql already applied to lesson_horses.exertion_level.
REVOKE SELECT ON TABLE public.lesson_riders FROM authenticated;
GRANT SELECT (id, barn_id, lesson_id, rider_id, cancellation_notes, cancelled_at) ON TABLE public.lesson_riders TO authenticated;

REVOKE ALL ON FUNCTION public.get_lesson_rider_notes(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_rider_notes(uuid, uuid) TO authenticated;
