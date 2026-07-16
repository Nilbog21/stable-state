-- #941: delete_expense_with_transactions mirrors delete_lesson_with_transactions
-- (see supabase/migrations_archive/20260714164916_rpc_collect_and_delete_lesson_transactions.sql)
-- for the single 'expense' transaction kind. An uncollected expense transaction row is
-- always deleted outright first (closes the gap where ON DELETE SET NULL would otherwise
-- leave a permanently-uncollected, untraceable orphan). A collected row is only deleted
-- when p_delete_collected is true; the default is to keep it, which the ON DELETE SET NULL
-- (expense_id) FK on transactions already handles once the horse_expenses row is deleted
-- below. expense_horses cascades via its existing ON DELETE CASCADE FK to horse_expenses.
CREATE FUNCTION public.delete_expense_with_transactions(
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

  DELETE FROM horse_expenses WHERE id = p_expense_id AND barn_id = p_barn_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_expense_with_transactions(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_expense_with_transactions(uuid, uuid, boolean) TO authenticated;
