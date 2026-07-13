-- #765: Riders must not be able to read horse exertion/exhaustion data, even via a
-- direct RPC call bypassing the UI. Both RPCs now reject any caller who isn't an
-- active manager or trainer of the barn.

CREATE OR REPLACE FUNCTION get_horse_projected_exhaustion(
  p_horse_id UUID,
  p_barn_id UUID,
  p_target_date TIMESTAMPTZ,
  p_exclude_lesson_id UUID DEFAULT NULL
)
RETURNS TABLE (lesson_at TIMESTAMPTZ, exertion_level SMALLINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id)) THEN
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

DROP FUNCTION IF EXISTS get_horse_exertion_summary(uuid, timestamptz);

CREATE FUNCTION get_horse_exertion_summary(p_barn_id uuid, p_since timestamptz)
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
                   AND l.lesson_at >= p_since
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
