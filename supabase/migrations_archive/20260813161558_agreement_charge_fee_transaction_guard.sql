-- #1441: `update_agreement_charge_fee` updated the paired `transactions` row with no
-- `IF NOT FOUND` guard. Its sibling `mark_agreement_charge_paid` has raised
-- `charge_transaction_not_found` for exactly this case since #885 — on a charge missing its
-- transaction, the fee edit succeeded and left the agreement detail page and every income
-- report showing different numbers, with no error anywhere. Charges are born from RPCs that
-- write the charge and its transaction atomically, so this should only ever fire for a
-- genuinely inconsistent row; the point is the symmetry with the sibling.
--
-- Signature unchanged, so the grants from `20260716005944_release3_rls.sql` survive the
-- CREATE OR REPLACE and no companion RLS migration is needed.

CREATE OR REPLACE FUNCTION update_agreement_charge_fee(
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'charge_transaction_not_found';
  END IF;

  RETURN v_charge;
END;
$$;
