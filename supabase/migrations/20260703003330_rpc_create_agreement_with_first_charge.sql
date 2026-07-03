CREATE FUNCTION create_agreement_with_first_charge(
  p_barn_id    uuid,
  p_rider_id   uuid,
  p_horse_id   uuid,
  p_fee        numeric,
  p_kind       agreement_kind,
  p_cadence    agreement_cadence,
  p_start_date date DEFAULT current_date
)
RETURNS agreements
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_agreement agreements;
  v_period    date;
BEGIN
  INSERT INTO agreements (barn_id, rider_id, horse_id, fee, kind, cadence, start_date)
  VALUES (p_barn_id, p_rider_id, p_horse_id, p_fee, p_kind, p_cadence, p_start_date)
  RETURNING * INTO v_agreement;

  v_period := date_trunc('month', CASE WHEN v_agreement.cadence = 'monthly'
                                        THEN current_date
                                        ELSE v_agreement.start_date END)::date;

  INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
  VALUES (p_barn_id, v_agreement.id, v_period, p_fee);

  RETURN v_agreement;
END;
$$;

GRANT EXECUTE ON FUNCTION create_agreement_with_first_charge(uuid, uuid, uuid, numeric, agreement_kind, agreement_cadence, date) TO authenticated;
