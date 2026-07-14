CREATE POLICY "manager_select_transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (auth_is_barn_manager(barn_id));

-- Baseline's ALTER DEFAULT PRIVILEGES auto-grants INSERT/UPDATE/DELETE to authenticated
-- on every new table. This table is written exclusively through SECURITY DEFINER RPCs
-- added in later issues, so revoke direct write access entirely.
REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated;
