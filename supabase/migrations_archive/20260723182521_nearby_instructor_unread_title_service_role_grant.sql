-- #1017 review fix: get_unread_notification_title is called from
-- generate-recurring-lessons.ts's service-role client (see its auth.uid()
-- IS NULL bypass), but the prior grants migration only granted EXECUTE to
-- authenticated. Function EXECUTE privilege isn't covered by the baseline's
-- table-only ALTER DEFAULT PRIVILEGES rule, so the cron job's call was
-- failing with permission denied -- matching the fix already applied to
-- get_instructor_membership_names/get_active_barn_member_summaries/
-- sync_lesson_transactions.
GRANT EXECUTE ON FUNCTION get_unread_notification_title(uuid, uuid, text) TO service_role;
