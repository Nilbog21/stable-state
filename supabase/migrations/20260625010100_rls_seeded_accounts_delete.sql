-- Authenticated users can delete their own pending row.
-- Required because activateSeededAccount runs as authenticated (SSR client) in the auth callback.
CREATE POLICY "seeded_accounts_delete_own"
  ON public.seeded_accounts FOR DELETE TO authenticated
  USING (email = auth.email());
