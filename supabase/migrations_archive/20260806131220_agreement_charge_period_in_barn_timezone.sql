-- #1361: create_agreement_with_first_charge picked a charge's period — and defaulted
-- p_start_date — from `current_date`, which resolves in the DB session's zone (UTC on
-- Supabase), not the barn's. Every zone the barn picker offers is behind UTC, so an
-- agreement created in the last 4-10 hours of the barn's month was filed under the *next*
-- month. The write-side mirror of #1309/#1360's read-side fixes.
--
-- The function derives the barn's own day from `barns.timezone` itself rather than taking a
-- resolved period parameter: no signature change, so the existing grants survive CREATE OR
-- REPLACE (no companion RLS migration) and no caller can pass the wrong frame. `p_start_date`
-- moves from `DEFAULT current_date` to `DEFAULT NULL` + COALESCE for the same reason — a
-- DEFAULT expression can't see p_barn_id, so the barn-frame fallback has to live in the body.
-- Unchanged from the applied definition otherwise (20260716005943_release3_functions.sql).
CREATE OR REPLACE FUNCTION create_agreement_with_first_charge(
  p_barn_id    uuid,
  p_rider_id   uuid,
  p_horse_id   uuid,
  p_fee        numeric,
  p_kind       agreement_kind,
  p_cadence    agreement_cadence,
  p_start_date date DEFAULT NULL
)
RETURNS agreements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agreement agreements;
  v_today     date;
  v_period    date;
  v_charge_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT (now() AT TIME ZONE timezone)::date INTO v_today
  FROM barns WHERE id = p_barn_id;

  IF v_today IS NULL THEN
    RAISE EXCEPTION 'barn not found';
  END IF;

  INSERT INTO agreements (barn_id, rider_id, horse_id, fee, kind, cadence, start_date)
  VALUES (p_barn_id, p_rider_id, p_horse_id, p_fee, p_kind, p_cadence, COALESCE(p_start_date, v_today))
  RETURNING * INTO v_agreement;

  v_period := date_trunc('month', CASE WHEN v_agreement.cadence = 'monthly'
                                        THEN v_today
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
