CREATE FUNCTION get_horse_projected_exhaustion(
  p_horse_id UUID,
  p_barn_id UUID,
  p_target_date TIMESTAMPTZ,
  p_exclude_lesson_id UUID DEFAULT NULL
)
RETURNS TABLE (lesson_at TIMESTAMPTZ, exertion_level SMALLINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid() AND barn_id = p_barn_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT l.lesson_at, lh.exertion_level
  FROM lesson_horses lh
  JOIN lessons l ON l.id = lh.lesson_id AND l.barn_id = p_barn_id
  WHERE lh.horse_id = p_horse_id
    AND lh.barn_id = p_barn_id
    AND l.cancelled_at IS NULL
    AND l.lesson_at BETWEEN p_target_date - INTERVAL '3 days' AND p_target_date + INTERVAL '3 days'
    AND (p_exclude_lesson_id IS NULL OR l.id <> p_exclude_lesson_id);
END;
$$;

REVOKE ALL ON FUNCTION get_horse_projected_exhaustion(UUID, UUID, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_horse_projected_exhaustion(UUID, UUID, TIMESTAMPTZ, UUID) TO authenticated;
