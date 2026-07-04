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
  p_horse_ids             uuid[]  DEFAULT NULL
)
RETURNS horse_expenses
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_expense horse_expenses;
BEGIN
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

  RETURN v_expense;
END;
$$;

GRANT EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[]) TO authenticated;
