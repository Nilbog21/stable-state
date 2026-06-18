-- Absorb seeded_accounts into profiles.
-- profiles gains a surrogate UUID PK, nullable user_id (unique), email (unique, NOT NULL),
-- and optional barn_id + role for pre-auth seeding.

-- 1. Add new columns (nullable first to allow backfill)
ALTER TABLE public.profiles
  ADD COLUMN id    UUID DEFAULT gen_random_uuid(),
  ADD COLUMN email TEXT,
  ADD COLUMN barn_id UUID REFERENCES public.barns(id),
  ADD COLUMN role   TEXT REFERENCES public.roles(name);

-- 2. Backfill email from auth.users for all existing profile rows
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id;

-- 3. Enforce email NOT NULL + UNIQUE
ALTER TABLE public.profiles
  ALTER COLUMN email SET NOT NULL,
  ADD CONSTRAINT profiles_email_unique UNIQUE (email);

-- 4. Swap the PK: user_id was the old PK; id becomes the new one
ALTER TABLE public.profiles DROP CONSTRAINT profiles_pkey;
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

-- 5. Drop seeded_accounts (its RLS policies drop automatically)
DROP TABLE public.seeded_accounts;

-- 6. Update the trigger to use profiles instead of seeded_accounts
CREATE OR REPLACE FUNCTION public.handle_new_user_role_grant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE email = NEW.email LIMIT 1;
  IF FOUND THEN
    UPDATE public.profiles SET user_id = NEW.id WHERE id = v_profile.id;
    IF v_profile.barn_id IS NOT NULL AND v_profile.role IS NOT NULL THEN
      INSERT INTO public.barn_memberships (user_id, barn_id, role, status)
      VALUES (NEW.id, v_profile.barn_id, v_profile.role, 'active')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
