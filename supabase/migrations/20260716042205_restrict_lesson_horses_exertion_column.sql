-- #937 review follow-up: getLessonById's app-layer omission of exertion_level for
-- the rider role isn't actually DB-enforced. lesson_horses has a table-wide
-- GRANT SELECT to authenticated, and its rider RLS policy (lesson_horses_select_rider)
-- is row-level only (checks enrollment, not columns) -- Postgres RLS filters rows,
-- it can't restrict columns. A rider could still read exertion_level via a direct
-- PostgREST call using their own session, bypassing the app entirely -- the same
-- "table has no column-level GRANT restriction for authenticated" gap this codebase
-- already closed for barn_memberships (get_instructor_membership_names,
-- get_active_barn_member_summaries) and transactions (get_lesson_payment_info).
--
-- Postgres has no "all columns except this one" grant -- revoking a column-level
-- privilege does not narrow an existing table-wide grant, so the table-wide SELECT
-- grant is revoked first and re-granted for every column except exertion_level.
-- exertion_level becomes readable only through get_lesson_horse_exertion_levels
-- below, gated the same way get_horse_exertion_summary/get_horse_projected_exhaustion
-- already are.
REVOKE SELECT ON TABLE public.lesson_horses FROM authenticated;
GRANT SELECT (id, barn_id, lesson_id, horse_id, horse_notes) ON TABLE public.lesson_horses TO authenticated;

CREATE FUNCTION get_lesson_horse_exertion_levels(p_lesson_id uuid, p_barn_id uuid)
RETURNS TABLE (horse_id uuid, exertion_level smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT lh.horse_id, lh.exertion_level
  FROM lesson_horses lh
  WHERE lh.lesson_id = p_lesson_id AND lh.barn_id = p_barn_id;
END;
$$;

REVOKE ALL ON FUNCTION get_lesson_horse_exertion_levels(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_lesson_horse_exertion_levels(uuid, uuid) TO authenticated;
