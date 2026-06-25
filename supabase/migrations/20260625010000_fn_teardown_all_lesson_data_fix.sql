-- Fix: add WHERE TRUE to satisfy Supabase's DELETE-without-WHERE-clause restriction.
CREATE OR REPLACE FUNCTION teardown_all_lesson_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM lesson_riders WHERE TRUE;
  DELETE FROM lesson_horses WHERE TRUE;
  DELETE FROM lessons WHERE TRUE;
END;
$$;
