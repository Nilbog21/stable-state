-- #829: wire horse_expenses into the transactions ledger (#826) — mirrors #827's
-- sync_lesson_transactions / #828's create_agreement_with_first_charge pattern.
--
-- create_expense_with_horses/update_expense_with_horses were SECURITY INVOKER,
-- relying on horse_expenses' own manager-only RLS to gate both the interactive
-- manager caller and the service-role seed caller (reset-db.ts) transparently.
-- transactions has INSERT/UPDATE/DELETE revoked from `authenticated`, so both are
-- converted to SECURITY DEFINER here with an explicit check that preserves prior
-- behavior for every caller class: a real non-manager caller is still rejected
-- (matches the old RLS denial), while a service-role caller (auth.uid() IS NULL) is
-- trusted, same as RLS-bypass treats it everywhere else in this app.
--
-- An expense only gets a transactions row once its amount is known — a planned
-- expense (amount IS NULL) has nothing to record yet. sync_expense_transaction is
-- PERFORMed from both create/update paths so a later "fill in the amount" update
-- inserts the row exactly as the acceptance criteria requires, and (for symmetry
-- and full branch coverage) clearing amount back to NULL removes it again.
-- collected is always true for an expense row — unlike income kinds, this app has
-- no "planned but uncollected cost" concept once an amount is known. amount is
-- stored negative, matching the signed-ledger convention instructor_payout already
-- established (an outflow), so a future SUM(amount) nets correctly.
CREATE UNIQUE INDEX transactions_expense_key
  ON public.transactions (expense_id) WHERE kind = 'expense';

CREATE FUNCTION public.sync_expense_transaction(
  p_barn_id uuid, p_expense_id uuid, p_amount numeric, p_occurred_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_amount IS NOT NULL THEN
    INSERT INTO transactions (barn_id, kind, amount, collected, occurred_at, expense_id)
    VALUES (p_barn_id, 'expense', -p_amount, true, p_occurred_at, p_expense_id)
    ON CONFLICT (expense_id) WHERE kind = 'expense'
    DO UPDATE SET amount = EXCLUDED.amount, occurred_at = EXCLUDED.occurred_at;
  ELSE
    DELETE FROM transactions WHERE expense_id = p_expense_id AND kind = 'expense';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_expense_transaction(uuid, uuid, numeric, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_expense_transaction(uuid, uuid, numeric, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION create_expense_with_horses(
  p_barn_id               uuid,
  p_expense_date          date,
  p_recipient             text,
  p_applies_to_all_horses boolean,
  p_expense_time          time    DEFAULT NULL,
  p_amount                numeric DEFAULT NULL,
  p_expense_type          text    DEFAULT 'Unspecified',
  p_notes                 text    DEFAULT NULL,
  p_horse_ids             uuid[]  DEFAULT NULL
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

  INSERT INTO horse_expenses (barn_id, expense_date, expense_time, amount, recipient, expense_type, notes, applies_to_all_horses)
  VALUES (p_barn_id, p_expense_date, p_expense_time, p_amount, p_recipient, p_expense_type, p_notes, p_applies_to_all_horses)
  RETURNING * INTO v_expense;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO expense_horses (barn_id, expense_id, horse_id)
    SELECT p_barn_id, v_expense.id, unnest(p_horse_ids);
  END IF;

  PERFORM sync_expense_transaction(
    p_barn_id, v_expense.id, p_amount,
    (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz
  );

  RETURN v_expense;
END;
$$;

GRANT EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION update_expense_with_horses(
  p_expense_id            uuid,
  p_barn_id               uuid,
  p_expense_date          date,
  p_recipient             text,
  p_applies_to_all_horses boolean,
  p_expense_time          time    DEFAULT NULL,
  p_amount                numeric DEFAULT NULL,
  p_expense_type          text    DEFAULT 'Unspecified',
  p_notes                 text    DEFAULT NULL,
  p_horse_ids             uuid[]  DEFAULT NULL
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
      applies_to_all_horses = p_applies_to_all_horses
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
    (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz
  );

  RETURN v_expense;
END;
$$;

GRANT EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[]) TO authenticated;
