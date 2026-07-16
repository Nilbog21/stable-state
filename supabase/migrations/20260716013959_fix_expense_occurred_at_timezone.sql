-- #935 follow-up: create_expense_with_horses/update_expense_with_horses derive
-- transactions.occurred_at via (p_expense_date + p_expense_time)::timestamptz,
-- a naive cast interpreted in the session's timezone (UTC) rather than the
-- user's local timezone — the same root cause as the lesson_at bug fixed
-- elsewhere in this issue. Adding a trailing parameter changes each function's
-- signature, so the old forms are dropped and recreated (same approach as
-- update_horse_details growing its threshold params, and this pair's own
-- prior p_payment_type addition in 20260715025145_rpc_expenses_write_payment_type.sql).
--
-- This migration only adds the capability to pass a correct pre-computed
-- instant — it is additive and backward-compatible. p_occurred_at defaults to
-- NULL, in which case both functions fall back to the exact naive derivation
-- they use today, so no caller's observable behavior changes until a caller
-- starts passing a real value. That wiring (ExpenseForm computing a true
-- local-aware instant client-side, mirroring DateHourPicker's fix) is left to
-- a follow-on issue.

DROP FUNCTION IF EXISTS public.create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum);

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
  p_occurred_at           timestamptz DEFAULT NULL
)
RETURNS horse_expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expense horse_expenses;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO horse_expenses (barn_id, expense_date, expense_time, amount, recipient, expense_type, notes, applies_to_all_horses, payment_type)
  VALUES (p_barn_id, p_expense_date, p_expense_time, p_amount, p_recipient, p_expense_type, p_notes, p_applies_to_all_horses, p_payment_type)
  RETURNING * INTO v_expense;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO expense_horses (barn_id, expense_id, horse_id)
    SELECT p_barn_id, v_expense.id, unnest(p_horse_ids);
  END IF;

  PERFORM sync_expense_transaction(
    p_barn_id, v_expense.id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum);

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
  p_occurred_at           timestamptz DEFAULT NULL
)
RETURNS horse_expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expense horse_expenses;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE horse_expenses
  SET expense_date          = p_expense_date,
      expense_time          = p_expense_time,
      amount                = p_amount,
      recipient             = p_recipient,
      expense_type          = p_expense_type,
      notes                 = p_notes,
      applies_to_all_horses = p_applies_to_all_horses,
      payment_type          = p_payment_type
  WHERE id = p_expense_id AND barn_id = p_barn_id
  RETURNING * INTO v_expense;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found';
  END IF;

  DELETE FROM expense_horses WHERE expense_id = p_expense_id AND barn_id = p_barn_id;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO expense_horses (barn_id, expense_id, horse_id)
    SELECT p_barn_id, p_expense_id, unnest(p_horse_ids);
  END IF;

  PERFORM sync_expense_transaction(
    p_barn_id, p_expense_id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz) TO authenticated, service_role;
