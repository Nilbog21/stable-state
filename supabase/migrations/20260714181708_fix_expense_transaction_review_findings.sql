-- #829 review follow-up: fix findings from /reviewIssue.
--
-- 1. sync_expense_transaction had no authorization check at all despite being
--    SECURITY DEFINER and GRANTed to authenticated — any authenticated user could
--    call it directly to fabricate/overwrite/delete an expense-kind transactions row
--    for any barn's any expense. Add the same auth_is_barn_manager check its two
--    callers (create_expense_with_horses/update_expense_with_horses) already perform
--    before PERFORMing this function — horse_expenses RLS is manager-only, unlike
--    lessons (any active barn member can create one), so this mirrors manager-only
--    rather than #827's auth_is_active_barn_member check on sync_lesson_transactions.
--
-- 2. The DELETE branch (amount cleared back to NULL) had no barn_id filter at all,
--    unlike the INSERT/upsert branch (gated by the transactions_expense_key partial
--    unique index plus the composite FK to horse_expenses(barn_id, id)) — a caller
--    supplying any real expense_id could delete that expense's ledger row regardless
--    of which barn it belonged to. Added here too.
--
-- 3. create_expense_with_horses/update_expense_with_horses were converted to
--    SECURITY DEFINER but never revoked from PUBLIC, unlike every other SECURITY
--    DEFINER RPC in this codebase — Postgres's default EXECUTE-to-PUBLIC grant
--    (never revoked since their original #517/#518 creation) left them reachable by
--    a fully unauthenticated anon-key caller, who satisfies this migration's
--    auth.uid() IS NULL "service-role" trust branch. Same bug class as #828's review
--    fix (commit c9292580) for the sibling agreement-charges RPCs — closing it the
--    same way: explicit REVOKE FROM PUBLIC, GRANT to authenticated + service_role.
CREATE OR REPLACE FUNCTION public.sync_expense_transaction(
  p_barn_id uuid, p_expense_id uuid, p_amount numeric, p_occurred_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_amount IS NOT NULL THEN
    INSERT INTO transactions (barn_id, kind, amount, collected, occurred_at, expense_id)
    VALUES (p_barn_id, 'expense', -p_amount, true, p_occurred_at, p_expense_id)
    ON CONFLICT (expense_id) WHERE kind = 'expense'
    DO UPDATE SET amount = EXCLUDED.amount, occurred_at = EXCLUDED.occurred_at;
  ELSE
    DELETE FROM transactions WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[]) TO authenticated, service_role;
