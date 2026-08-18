-- #1001: update_horse_details grows from 10 to 11 params, mirroring the
-- #759/#1005 drop/recreate pattern. p_registered_name is written as-given
-- (including NULL, which clears it) rather than COALESCE'd like p_name.
DROP FUNCTION public.update_horse_details(uuid, uuid, text, boolean, boolean, text, int, int, text, text);

CREATE FUNCTION update_horse_details(
  p_horse_id uuid,
  p_barn_id uuid,
  p_name text,
  p_is_active boolean,
  p_is_available boolean,
  p_unavailability_reason text,
  p_exhaustion_threshold_moderate int DEFAULT NULL,
  p_exhaustion_threshold_high int DEFAULT NULL,
  p_feed_notes text DEFAULT NULL,
  p_medication_notes text DEFAULT NULL,
  p_registered_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE horses
  SET name = COALESCE(p_name, name),
      is_active = p_is_active,
      is_available = p_is_available,
      unavailability_reason = p_unavailability_reason,
      deactivated_at = CASE
        WHEN horses.is_active = p_is_active THEN horses.deactivated_at
        WHEN p_is_active THEN NULL
        ELSE now()
      END,
      exhaustion_threshold_moderate = p_exhaustion_threshold_moderate,
      exhaustion_threshold_high = p_exhaustion_threshold_high,
      feed_notes = p_feed_notes,
      medication_notes = p_medication_notes,
      registered_name = p_registered_name
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;

-- #1001: get_horse_exertion_summary gains registered_name so the Horses list
-- page (which reads this RPC, not the raw table, for manager/trainer callers)
-- can render it on HorseCard alongside the barn name.
DROP FUNCTION public.get_horse_exertion_summary(uuid, timestamptz);

CREATE FUNCTION get_horse_exertion_summary(p_barn_id uuid, p_target_date timestamptz)
RETURNS TABLE (
  id                            uuid,
  name                          text,
  registered_name               text,
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
    h.registered_name,
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
