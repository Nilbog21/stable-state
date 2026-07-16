-- #936: get_horse_exertion_summary previously summed exertion over an unbounded
-- forward window (lesson_at >= p_since), while the horses page's ExhaustionBar
-- (get_horse_projected_exhaustion) uses a ±3-day window centered on today —
-- the two numbers measured different things, so the Available section's sort
-- order looked scrambled against the bar it sits next to. Realigns this
-- function's window to the exact same BETWEEN clause get_horse_projected_exhaustion
-- already uses, so the two can't drift apart again. The p_since -> p_target_date
-- rename requires DROP + CREATE (Postgres rejects a parameter rename via CREATE
-- OR REPLACE), so grants are re-applied below, mirroring the same DROP+CREATE
-- pattern release3_functions.sql/release3_rls.sql already used for this function.
DROP FUNCTION public.get_horse_exertion_summary(uuid, timestamptz);

CREATE FUNCTION get_horse_exertion_summary(p_barn_id uuid, p_target_date timestamptz)
RETURNS TABLE (
  id                            uuid,
  name                          text,
  is_active                     boolean,
  is_available                  boolean,
  unavailability_reason         text,
  exhaustion_threshold_high     int,
  exhaustion_threshold_moderate int,
  lesson_count                  bigint,
  total_exertion                bigint,
  jumping_count                 bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.name,
    h.is_active,
    h.is_available,
    h.unavailability_reason,
    h.exhaustion_threshold_high,
    h.exhaustion_threshold_moderate,
    COALESCE(agg.lesson_count, 0)    AS lesson_count,
    COALESCE(agg.total_exertion, 0)  AS total_exertion,
    COALESCE(agg.jumping_count, 0)   AS jumping_count
  FROM horses h
  LEFT JOIN (
    SELECT
      lh.horse_id,
      COUNT(lh.lesson_id)::bigint                   AS lesson_count,
      SUM(lh.exertion_level)::bigint                AS total_exertion,
      COUNT(CASE WHEN l.jumping THEN 1 END)::bigint AS jumping_count
    FROM lesson_horses lh
    JOIN lessons l ON l.id = lh.lesson_id
                   AND l.barn_id = p_barn_id
                   AND l.lesson_at BETWEEN p_target_date - INTERVAL '3 days' AND p_target_date + INTERVAL '3 days'
                   AND l.cancelled_at IS NULL
    WHERE lh.barn_id = p_barn_id
    GROUP BY lh.horse_id
  ) agg ON agg.horse_id = h.id
  WHERE h.barn_id = p_barn_id
  ORDER BY h.name;
END;
$$;

REVOKE ALL ON FUNCTION get_horse_exertion_summary(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_horse_exertion_summary(uuid, timestamptz) TO authenticated;
