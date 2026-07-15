-- #831: drop the two legacy payment_type columns now that every reader/writer
-- has been cut over to the transactions ledger — #885 stopped every RPC from
-- writing them, and this migration's own get_outstanding_transactions RPC
-- (see 20260715024545) is the last reader (getOutstandingLessonRows/
-- getOutstandingCharges). payment_type_enum itself stays — still used by
-- transactions.payment_type.
ALTER TABLE public.lessons DROP COLUMN payment_type;
ALTER TABLE public.agreement_charges DROP COLUMN payment_type;

-- Review fix: mark_agreement_charge_paid (20260715022437) still assigned
-- v_charge.payment_type := p_payment_type before returning v_charge, a
-- agreement_charges%ROWTYPE variable — PL/pgSQL resolves record field
-- references at runtime, so that line would fail with "record has no field
-- payment_type" on the very next call once the column above is gone. The
-- returned row's payment_type was only ever a display nicety (#885); no
-- caller reads it (updateChargePaymentType discards the RPC's return value),
-- so the fix is simply to stop setting it.
CREATE OR REPLACE FUNCTION mark_agreement_charge_paid(
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

  SELECT * INTO v_charge FROM agreement_charges WHERE id = p_charge_id AND barn_id = p_barn_id;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'charge not found';
  END IF;

  UPDATE transactions
  SET collected = (p_payment_type IS NOT NULL), payment_type = p_payment_type
  WHERE agreement_charge_id = p_charge_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'charge_transaction_not_found';
  END IF;

  RETURN v_charge;
END;
$$;
