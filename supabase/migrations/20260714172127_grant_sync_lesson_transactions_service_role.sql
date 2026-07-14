-- #827 follow-up: sync_lesson_transactions revoked EXECUTE from PUBLIC and only
-- re-granted it to `authenticated`, unlike assert_lesson_participant_counts (never
-- revoked from PUBLIC). Since create_lesson_with_participants/update_lesson_with_participants/
-- create_lesson_series_with_participants/generate_lesson_for_series are all SECURITY
-- INVOKER, their PERFORM sync_lesson_transactions(...) call checks EXECUTE against the
-- actual caller — service_role for scripts/reset-db.ts and the nightly
-- generate-recurring-lessons.ts job — which had no grant and hit
-- "permission denied for function sync_lesson_transactions".
GRANT EXECUTE ON FUNCTION public.sync_lesson_transactions(uuid, uuid, numeric, numeric, uuid, payment_type_enum, timestamptz) TO service_role;
