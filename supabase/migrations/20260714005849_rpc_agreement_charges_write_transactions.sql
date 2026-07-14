-- Both functions are called by an authenticated manager (interactive create/generate
-- flows) AND by service-role scripts (reset-db.ts seeding, the nightly
-- generate-agreement-charges.ts cron). They were SECURITY INVOKER, relying on
-- agreements'/agreement_charges' own RLS to gate both caller types transparently.
-- transactions has INSERT revoked from `authenticated` at the grant level (writable
-- only via SECURITY DEFINER RPCs), so both are converted to SECURITY DEFINER here with
-- an explicit check that preserves prior behavior for every caller class: a real
-- non-manager caller is still rejected (matches the old RLS denial), while a
-- service-role caller (auth.uid() IS NULL) is trusted, same as RLS-bypass treats it
-- everywhere else in this app.

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
    CASE WHEN p_kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END,
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
  v_period        date := date_trunc('month', p_period)::date;
  v_agreement     agreements;
  v_charge        agreement_charges;
  v_new_charge_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_agreement FROM agreements WHERE id = p_agreement_id AND barn_id = p_barn_id;
  IF v_agreement.id IS NULL THEN
    RAISE EXCEPTION 'agreement not found';
  END IF;

  INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
  VALUES (v_agreement.barn_id, v_agreement.id, v_period, v_agreement.fee)
  ON CONFLICT (agreement_id, period) DO NOTHING
  RETURNING id INTO v_new_charge_id;

  -- Only insert a paired transaction when a new charge was actually created, not on a
  -- no-op retry of an already-generated period (idempotency, matching this function's
  -- existing ON CONFLICT DO NOTHING semantics).
  IF v_new_charge_id IS NOT NULL THEN
    INSERT INTO transactions (barn_id, kind, amount, collected, membership_id, horse_id, occurred_at, agreement_charge_id)
    VALUES (
      v_agreement.barn_id,
      CASE WHEN v_agreement.kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END,
      v_agreement.fee,
      false,
      v_agreement.rider_id,
      v_agreement.horse_id,
      v_period::timestamptz,
      v_new_charge_id
    );
  END IF;

  SELECT * INTO v_charge
  FROM agreement_charges
  WHERE agreement_id = p_agreement_id AND barn_id = p_barn_id AND period = v_period;

  RETURN v_charge;
END;
$$;
