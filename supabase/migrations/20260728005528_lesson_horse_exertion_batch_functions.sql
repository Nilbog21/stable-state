-- #1019: batch sibling of get_lesson_horse_exertion_levels.
--
-- lesson_horses.exertion_level has no SELECT grant to `authenticated` (#937 revoked the
-- table-wide grant and re-granted every column but this one), so that RPC is the only way
-- to read it. It takes a single p_lesson_id, which is one round trip per lesson -- fine for
-- the lesson detail page, not for the month conflict calendar, which decorates a whole
-- month's lessons at once. This variant takes the id array and returns lesson_id alongside
-- so one call covers the range.
--
-- Row filter is identical to the per-lesson function (see
-- 20260725005005_lesson_exertion_owner_visibility.sql): manager/trainer see every row, a
-- rider sees only a horse they hold lesson_read_privileges for.
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

REVOKE EXECUTE ON FUNCTION public.get_lesson_horse_exertion_levels_batch(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_horse_exertion_levels_batch(uuid[], uuid) TO authenticated;
