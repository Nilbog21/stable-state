CREATE FUNCTION generate_agreement_charge(
  p_agreement_id uuid,
  p_barn_id      uuid,
  p_period       date
)
RETURNS agreement_charges
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_period  date := date_trunc('month', p_period)::date;
  v_charge  agreement_charges;
BEGIN
  INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
  SELECT barn_id, id, v_period, fee
  FROM agreements
  WHERE id = p_agreement_id AND barn_id = p_barn_id
  ON CONFLICT (agreement_id, period) DO NOTHING;

  SELECT * INTO v_charge
  FROM agreement_charges
  WHERE agreement_id = p_agreement_id AND barn_id = p_barn_id AND period = v_period;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'agreement not found';
  END IF;

  RETURN v_charge;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_agreement_charge(uuid, uuid, date) TO authenticated;
