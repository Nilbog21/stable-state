-- Roles lookup
CREATE TABLE public.roles (
  name TEXT PRIMARY KEY CHECK (name IN ('admin', 'manager', 'trainer', 'rider'))
);
INSERT INTO public.roles (name) VALUES ('admin'), ('manager'), ('trainer'), ('rider');

-- Barns
CREATE TABLE public.barns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-seeded emails (admin inserts here to reserve a role for a Google email before the
-- user first signs in; required because Google OAuth-only means we cannot create
-- auth.users rows directly)
CREATE TABLE public.seeded_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL REFERENCES public.roles(name),
  barn_id UUID REFERENCES public.barns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Barn memberships (barn_id nullable for admin, who is global rather than barn-scoped)
CREATE TABLE public.barn_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barn_id UUID REFERENCES public.barns(id) ON DELETE CASCADE,
  role TEXT NOT NULL REFERENCES public.roles(name),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, barn_id)
);

-- Auto-grant trigger: when a new auth.users row is inserted (first OAuth sign-in),
-- check seeded_accounts and create an active membership if a match is found
CREATE OR REPLACE FUNCTION public.handle_new_user_role_grant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seeded public.seeded_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_seeded FROM public.seeded_accounts WHERE email = NEW.email LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.barn_memberships (user_id, barn_id, role, status)
    VALUES (NEW.id, v_seeded.barn_id, v_seeded.role, 'active')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role_grant();

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
