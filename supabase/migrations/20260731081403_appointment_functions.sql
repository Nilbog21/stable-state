-- #1148 function half (see the ..._appointments_split.sql companion for the rationale).
--
-- The four RPCs keep their names: they are still the expense-writing entry points a manager
-- drives from /barn/[slug]/expenses, and renaming them would churn the DAL, the docs and
-- every grant for no behavioral gain.

-- sync_expense_transaction now owns the cost row as well as the ledger row. It already
-- upserted-or-deleted on exactly the p_amount IS NULL condition, from exactly the
-- (amount, payment_type) pair the cost row holds, so folding the cost write in keeps one
-- write path instead of duplicating it across both callers below. Its existing manager-only
-- check is already the gate appointment_costs' RLS wants.
CREATE OR REPLACE FUNCTION public.sync_expense_transaction(
  p_barn_id uuid, p_expense_id uuid, p_amount numeric, p_occurred_at timestamptz,
  p_payment_type payment_type_enum DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_amount IS NOT NULL THEN
    INSERT INTO appointment_costs (barn_id, appointment_id, amount, payment_type)
    VALUES (p_barn_id, p_expense_id, p_amount, p_payment_type)
    ON CONFLICT (appointment_id)
    DO UPDATE SET amount = EXCLUDED.amount, payment_type = EXCLUDED.payment_type;

    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, occurred_at, expense_id)
    VALUES (p_barn_id, 'expense', -p_amount, (p_payment_type IS NOT NULL), p_payment_type, p_occurred_at, p_expense_id)
    ON CONFLICT (expense_id) WHERE kind = 'expense'
    DO UPDATE SET amount = EXCLUDED.amount, collected = EXCLUDED.collected, payment_type = EXCLUDED.payment_type, occurred_at = EXCLUDED.occurred_at;
  ELSE
    -- Clearing an appointment back to unpriced drops both rows, so "no cost row" keeps
    -- meaning "not priced yet" for getOutstandingExpenses.
    DELETE FROM appointment_costs WHERE appointment_id = p_expense_id AND barn_id = p_barn_id;
    DELETE FROM transactions WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense';
  END IF;
END;
$$;

-- Both writers return the appointment row type, which CREATE OR REPLACE cannot retarget
-- from the (now nonexistent) horse_expenses composite type -- hence DROP and CREATE, with
-- the #829/#935-era grants re-applied at the bottom of this file.
DROP FUNCTION IF EXISTS create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz);

CREATE FUNCTION create_expense_with_horses(
  p_barn_id               uuid,
  p_expense_date          date,
  p_recipient             text,
  p_applies_to_all_horses boolean,
  p_expense_time          time    DEFAULT NULL,
  p_amount                numeric DEFAULT NULL,
  p_expense_type          text    DEFAULT 'Unspecified',
  p_notes                 text    DEFAULT NULL,
  p_horse_ids             uuid[]  DEFAULT NULL,
  p_payment_type          payment_type_enum DEFAULT NULL,
  -- #935: lets a caller pass a real local-aware instant instead of the naive
  -- (p_expense_date + p_expense_time)::timestamptz cast below, which is
  -- interpreted in the session's timezone (UTC) rather than the user's own.
  -- Defaults to NULL, in which case that exact naive derivation is used.
  p_occurred_at           timestamptz DEFAULT NULL
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appointment appointments;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO appointments (barn_id, expense_date, expense_time, recipient, expense_type, notes, applies_to_all_horses)
  VALUES (p_barn_id, p_expense_date, p_expense_time, p_recipient, p_expense_type, p_notes, p_applies_to_all_horses)
  RETURNING * INTO v_appointment;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO appointment_horses (barn_id, appointment_id, horse_id)
    SELECT p_barn_id, v_appointment.id, unnest(p_horse_ids);
  END IF;

  -- p_amount/p_payment_type are no longer columns on the row inserted above -- this call is
  -- now the only thing that persists them, into appointment_costs and the ledger both.
  PERFORM sync_expense_transaction(
    p_barn_id, v_appointment.id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_appointment;
END;
$$;

DROP FUNCTION IF EXISTS update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz);

CREATE FUNCTION update_expense_with_horses(
  p_expense_id            uuid,
  p_barn_id               uuid,
  p_expense_date          date,
  p_recipient             text,
  p_applies_to_all_horses boolean,
  p_expense_time          time    DEFAULT NULL,
  p_amount                numeric DEFAULT NULL,
  p_expense_type          text    DEFAULT 'Unspecified',
  p_notes                 text    DEFAULT NULL,
  p_horse_ids             uuid[]  DEFAULT NULL,
  p_payment_type          payment_type_enum DEFAULT NULL,
  -- #935: see create_expense_with_horses above.
  p_occurred_at           timestamptz DEFAULT NULL
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appointment appointments;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE appointments
  SET expense_date          = p_expense_date,
      expense_time          = p_expense_time,
      recipient             = p_recipient,
      expense_type          = p_expense_type,
      notes                 = p_notes,
      applies_to_all_horses = p_applies_to_all_horses
  WHERE id = p_expense_id AND barn_id = p_barn_id
  RETURNING * INTO v_appointment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found';
  END IF;

  DELETE FROM appointment_horses WHERE appointment_id = p_expense_id AND barn_id = p_barn_id;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO appointment_horses (barn_id, appointment_id, horse_id)
    SELECT p_barn_id, p_expense_id, unnest(p_horse_ids);
  END IF;

  PERFORM sync_expense_transaction(
    p_barn_id, p_expense_id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_appointment;
END;
$$;

-- #941, unchanged apart from the table name. The cost row needs no handling here: it hangs
-- off appointments by ON DELETE CASCADE, same as appointment_horses.
CREATE OR REPLACE FUNCTION public.delete_expense_with_transactions(
  p_expense_id uuid, p_barn_id uuid, p_delete_collected boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM transactions
  WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense' AND collected = false;

  IF p_delete_collected THEN
    DELETE FROM transactions
    WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense';
  END IF;

  DELETE FROM appointments WHERE id = p_expense_id AND barn_id = p_barn_id;
END;
$$;

-- Re-applied for the two dropped-and-recreated functions only: a fresh CREATE carries the
-- default PUBLIC EXECUTE grant, which is the #829 anon-bypass bug (an unauthenticated
-- anon-key caller would sail through the `auth.uid() IS NULL` service-role branch).
REVOKE EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) TO authenticated, service_role;
