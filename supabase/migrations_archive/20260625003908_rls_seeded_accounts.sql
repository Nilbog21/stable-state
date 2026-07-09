ALTER TABLE public.seeded_accounts ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own pending row (service_role bypasses RLS by default).
CREATE POLICY "seeded_accounts_select_own"
  ON public.seeded_accounts FOR SELECT TO authenticated
  USING (email = auth.email());
