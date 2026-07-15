-- Replaces the old direct `agreement_charges` table update from updateCharge (the
-- inline Fee edit on ChargesTable), keeping transactions.amount in sync — otherwise
-- getChargesForSummary/getPaidCharges (reading from transactions as of this release)
-- would silently diverge from a charge's post-edit displayed fee.
CREATE FUNCTION update_agreement_charge_fee(
  p_charge_id uuid,
  p_barn_id   uuid,
  p_fee       numeric
)
RETURNS agreement_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_charge agreement_charges;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE agreement_charges
  SET fee = p_fee
  WHERE id = p_charge_id AND barn_id = p_barn_id
  RETURNING * INTO v_charge;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'charge not found';
  END IF;

  UPDATE transactions
  SET amount = p_fee
  WHERE agreement_charge_id = p_charge_id AND barn_id = p_barn_id;

  RETURN v_charge;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_agreement_charge_fee(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_agreement_charge_fee(uuid, uuid, numeric) TO authenticated;
