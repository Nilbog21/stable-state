CREATE FUNCTION create_expense_with_horses(
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
SECURITY INVOKER
AS $$
DECLARE
  v_expense horse_expenses;
BEGIN
  INSERT INTO horse_expenses (barn_id, expense_date, expense_time, amount, recipient, expense_type, notes, applies_to_all_horses)
  VALUES (p_barn_id, p_expense_date, p_expense_time, p_amount, p_recipient, p_expense_type, p_notes, p_applies_to_all_horses)
  RETURNING * INTO v_expense;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO expense_horses (barn_id, expense_id, horse_id)
    SELECT p_barn_id, v_expense.id, unnest(p_horse_ids);
  END IF;

  RETURN v_expense;
END;
$$;

GRANT EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[]) TO authenticated;
