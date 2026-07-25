-- #999 review follow-up: 20260724003222_lesson_rider_notes_privilege_rls.sql
-- revoked table-wide SELECT on lesson_riders.rider_notes/private_notes for
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

REVOKE ALL ON FUNCTION public.update_lesson_rider_notes(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_lesson_rider_notes(uuid, uuid, uuid, text, text) TO authenticated;
