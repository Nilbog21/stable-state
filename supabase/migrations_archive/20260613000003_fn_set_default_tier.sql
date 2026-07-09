CREATE OR REPLACE FUNCTION set_default_tier(p_tier_id uuid, p_barn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE lesson_tiers SET is_default = false WHERE barn_id = p_barn_id;
  UPDATE lesson_tiers SET is_default = true WHERE id = p_tier_id AND barn_id = p_barn_id;
END;
$$;
