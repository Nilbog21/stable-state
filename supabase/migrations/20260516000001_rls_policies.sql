-- Row Level Security
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seeded_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barn_memberships ENABLE ROW LEVEL SECURITY;

-- roles: readable by anyone (lookup table)
CREATE POLICY "roles_read_all" ON public.roles
  FOR SELECT USING (true);

-- barns: readable by authenticated users (needed to render barn login pages)
CREATE POLICY "barns_read_authenticated" ON public.barns
  FOR SELECT TO authenticated USING (true);

-- seeded_accounts: authenticated users may read only their own entry
CREATE POLICY "seeded_accounts_read_own" ON public.seeded_accounts
  FOR SELECT TO authenticated USING (email = auth.email());

-- barn_memberships: users may read their own memberships
CREATE POLICY "barn_memberships_read_own" ON public.barn_memberships
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- barn_memberships: users may upsert their own row (required for applySeededMembership)
CREATE POLICY "barn_memberships_write_own" ON public.barn_memberships
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
