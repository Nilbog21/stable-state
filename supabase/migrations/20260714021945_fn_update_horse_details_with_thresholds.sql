DROP FUNCTION IF EXISTS update_horse_details(uuid, uuid, text, boolean, boolean, text);

CREATE FUNCTION update_horse_details(
  p_horse_id uuid,
  p_barn_id uuid,
  p_name text,
  p_is_active boolean,
  p_is_available boolean,
  p_unavailability_reason text,
  p_exhaustion_threshold_moderate int DEFAULT NULL,
  p_exhaustion_threshold_high int DEFAULT NULL
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
      exhaustion_threshold_high = p_exhaustion_threshold_high
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;
