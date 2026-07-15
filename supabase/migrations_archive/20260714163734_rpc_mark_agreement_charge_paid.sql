-- Replaces the old direct `agreement_charges` table update from updateChargePaymentType
-- (transactions has INSERT/UPDATE/DELETE revoked from `authenticated`, so a raw table
-- write can no longer keep the two in sync). Continues to write
-- agreement_charges.payment_type (dual-write, unchanged legacy behavior) so
-- getOutstandingCharges keeps working unchanged until #831 cuts it over.
CREATE FUNCTION mark_agreement_charge_paid(
  p_charge_id    uuid,
  p_barn_id      uuid,
  p_payment_type payment_type_enum
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
  SET payment_type = p_payment_type
  WHERE id = p_charge_id AND barn_id = p_barn_id
  RETURNING * INTO v_charge;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'charge not found';
  END IF;

  UPDATE transactions
  SET collected = (p_payment_type IS NOT NULL), payment_type = p_payment_type
  WHERE agreement_charge_id = p_charge_id AND barn_id = p_barn_id;

  RETURN v_charge;
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_agreement_charge_paid(uuid, uuid, payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_agreement_charge_paid(uuid, uuid, payment_type_enum) TO authenticated;
