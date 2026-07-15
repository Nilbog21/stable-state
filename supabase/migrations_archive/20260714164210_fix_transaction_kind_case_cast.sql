-- Fixes both #828 RPCs: `CASE WHEN ... THEN 'lease_charge' ELSE 'board_charge' END` with two
-- string-literal branches resolves to `text`, not the `transaction_kind` enum — Postgres has
-- no implicit text->enum cast, so every transactions insert failed with "column kind is of
-- type transaction_kind but expression is of type text" (caught via reset-db.ts seeding).
CREATE OR REPLACE FUNCTION create_agreement_with_first_charge(
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
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agreement agreements;
  v_period    date;
  v_charge_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO agreements (barn_id, rider_id, horse_id, fee, kind, cadence, start_date)
  VALUES (p_barn_id, p_rider_id, p_horse_id, p_fee, p_kind, p_cadence, p_start_date)
  RETURNING * INTO v_agreement;

  v_period := date_trunc('month', CASE WHEN v_agreement.cadence = 'monthly'
                                        THEN current_date
                                        ELSE v_agreement.start_date END)::date;

  INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
  VALUES (p_barn_id, v_agreement.id, v_period, p_fee)
  RETURNING id INTO v_charge_id;

  INSERT INTO transactions (barn_id, kind, amount, collected, membership_id, horse_id, occurred_at, agreement_charge_id)
  VALUES (
    p_barn_id,
    (CASE WHEN p_kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END)::transaction_kind,
    p_fee,
    false,
    p_rider_id,
    p_horse_id,
    v_period::timestamptz,
    v_charge_id
  );

  RETURN v_agreement;
END;
$$;

CREATE OR REPLACE FUNCTION generate_agreement_charge(
  p_agreement_id uuid,
  p_barn_id      uuid,
  p_period       date
)
RETURNS agreement_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period  date := date_trunc('month', p_period)::date;
  v_charge  agreement_charges;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM agreements WHERE id = p_agreement_id AND barn_id = p_barn_id) THEN
    RAISE EXCEPTION 'agreement not found';
  END IF;

  WITH new_charge AS (
    INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
    SELECT barn_id, id, v_period, fee
    FROM agreements
    WHERE id = p_agreement_id AND barn_id = p_barn_id
    ON CONFLICT (agreement_id, period) DO NOTHING
    RETURNING id, barn_id, agreement_id, fee
  )
  INSERT INTO transactions (barn_id, kind, amount, collected, membership_id, horse_id, occurred_at, agreement_charge_id)
  SELECT new_charge.barn_id,
         (CASE WHEN a.kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END)::transaction_kind,
         new_charge.fee,
         false,
         a.rider_id,
         a.horse_id,
         v_period::timestamptz,
         new_charge.id
  FROM new_charge
  JOIN agreements a ON a.id = new_charge.agreement_id AND a.barn_id = new_charge.barn_id;

  SELECT * INTO v_charge
  FROM agreement_charges
  WHERE agreement_id = p_agreement_id AND barn_id = p_barn_id AND period = v_period;

  RETURN v_charge;
END;
$$;
