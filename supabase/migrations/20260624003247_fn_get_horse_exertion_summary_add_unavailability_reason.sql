DROP FUNCTION IF EXISTS get_horse_exertion_summary(uuid, timestamptz);

CREATE FUNCTION get_horse_exertion_summary(p_barn_id uuid, p_since timestamptz)
RETURNS TABLE (
  id                   uuid,
  name                 text,
  is_active            boolean,
  is_available         boolean,
  unavailability_reason text,
  lesson_count         bigint,
  total_exertion       bigint,
  jumping_count        bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    h.id,
    h.name,
    h.is_active,
    h.is_available,
    h.unavailability_reason,
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
    WHERE lh.barn_id = p_barn_id
    GROUP BY lh.horse_id
  ) agg ON agg.horse_id = h.id
  WHERE h.barn_id = p_barn_id
  ORDER BY h.name;
$$;
