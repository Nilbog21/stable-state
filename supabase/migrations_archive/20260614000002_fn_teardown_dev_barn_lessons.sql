-- Dev teardown helper: delete all lesson-related rows for a barn in one transaction
-- so the deferred participant-count trigger sees lessons already gone at commit and skips checks.
-- Restricted to service_role; never called from application code.
CREATE OR REPLACE FUNCTION teardown_dev_barn_lessons(p_barn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM lesson_riders WHERE barn_id = p_barn_id;
  DELETE FROM lesson_horses WHERE barn_id = p_barn_id;
  DELETE FROM lessons WHERE barn_id = p_barn_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION teardown_dev_barn_lessons(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION teardown_dev_barn_lessons(uuid) TO service_role;
