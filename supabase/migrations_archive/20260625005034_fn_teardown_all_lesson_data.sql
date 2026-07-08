-- Global teardown helper: delete all lesson-related rows in one transaction
-- so the deferred participant-count trigger sees lessons already gone at commit and skips checks.
-- Restricted to service_role; never called from application code.
CREATE OR REPLACE FUNCTION teardown_all_lesson_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM lesson_riders;
  DELETE FROM lesson_horses;
  DELETE FROM lessons;
END;
$$;

REVOKE EXECUTE ON FUNCTION teardown_all_lesson_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teardown_all_lesson_data() TO service_role;
