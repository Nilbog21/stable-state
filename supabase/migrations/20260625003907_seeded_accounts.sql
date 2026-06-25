-- Staging table for manager accounts seeded before first OAuth sign-in.
-- A row's existence signals "invited but not yet activated"; it is deleted on first sign-in.
CREATE TABLE public.seeded_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  barn_id UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  role TEXT NOT NULL REFERENCES public.roles(name),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drop the trigger + function that read profiles.barn_id/role on auth.users INSERT;
-- activation is now handled explicitly by activateSeededAccount in the auth callback.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_role_grant();

-- Remove the one-time seeding columns from profiles; seeded_accounts is the staging area now.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS barn_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
