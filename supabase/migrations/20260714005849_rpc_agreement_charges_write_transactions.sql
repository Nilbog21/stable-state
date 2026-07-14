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
--
-- `auth.uid() IS NULL` is also true for a completely unauthenticated (anon-key) caller,
-- not just a service-role one — Postgres/PostgREST has no way for the IF check alone to
-- tell them apart. Under the old SECURITY INVOKER shape this didn't matter (anon has no
-- table-level INSERT grant on agreements/agreement_charges), but SECURITY DEFINER
-- bypasses that entirely. Both functions were also never revoked from PUBLIC, unlike
-- every other SECURITY DEFINER RPC in this codebase, so PUBLIC's default EXECUTE grant
-- left them reachable by an anon caller too. Explicitly revoking PUBLIC and granting
-- only to `authenticated`/`service_role` below closes that: an anon caller now gets a
-- permission-denied error before the function body ever runs, leaving `auth.uid() IS
-- NULL` inside the body to mean only "service role," as intended.

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
  v_period  date := date_trunc('month', p_period)::date;
  v_charge  agreement_charges;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM agreements WHERE id = p_agreement_id AND barn_id = p_barn_id) THEN
    RAISE EXCEPTION 'agreement not found';
  END IF;

  -- fee/kind/rider_id/horse_id are read from `agreements` and written in this single
  -- statement (via the `new_charge` CTE feeding the transactions INSERT's FROM/JOIN), not
  -- across two separate statements — a concurrent updateAgreement fee edit can't be
  -- observed mid-function and land a stale fee, the same atomicity guarantee the
  -- pre-transactions-ledger version of this RPC established.
  WITH new_charge AS (
    INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
    SELECT barn_id, id, v_period, fee
    FROM agreements
    WHERE id = p_agreement_id AND barn_id = p_barn_id
    ON CONFLICT (agreement_id, period) DO NOTHING
    RETURNING id, barn_id, agreement_id, fee
  )
  -- Only inserts a paired transaction when a new charge was actually created — the
  -- `new_charge` CTE yields zero rows on a no-op retry of an already-generated period,
  -- so this INSERT...SELECT naturally inserts nothing too (idempotency, matching this
  -- function's existing ON CONFLICT DO NOTHING semantics).
  INSERT INTO transactions (barn_id, kind, amount, collected, membership_id, horse_id, occurred_at, agreement_charge_id)
  SELECT new_charge.barn_id,
         CASE WHEN a.kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END,
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

REVOKE EXECUTE ON FUNCTION create_agreement_with_first_charge(uuid, uuid, uuid, numeric, agreement_kind, agreement_cadence, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_agreement_with_first_charge(uuid, uuid, uuid, numeric, agreement_kind, agreement_cadence, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION generate_agreement_charge(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_agreement_charge(uuid, uuid, date) TO authenticated, service_role;
