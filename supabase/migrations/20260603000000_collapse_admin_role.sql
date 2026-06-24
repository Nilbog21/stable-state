-- Convert any seeded admin accounts and memberships to barn-scoped manager of the barn
-- with slug 'sme'. Skips safely when no 'sme' barn exists (e.g. CI with no seeded data).
DO $$
DECLARE
  v_barn_id UUID;
BEGIN
  SELECT id INTO v_barn_id FROM public.barns WHERE slug = 'sme';
  IF v_barn_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.seeded_accounts SET role = 'manager', barn_id = v_barn_id WHERE role = 'admin';
  UPDATE public.barn_memberships SET role = 'manager', barn_id = v_barn_id WHERE role = 'admin' AND barn_id IS NULL;
END $$;

-- Remove admin from the roles lookup table.
DELETE FROM public.roles WHERE name = 'admin';

-- Tighten the roles CHECK constraint to exclude admin.
ALTER TABLE public.roles DROP CONSTRAINT roles_name_check;
ALTER TABLE public.roles ADD CONSTRAINT roles_name_check
  CHECK (name IN ('manager', 'trainer', 'rider'));

-- Now that no NULL barn_id rows remain, enforce NOT NULL on both tables.
ALTER TABLE public.barn_memberships ALTER COLUMN barn_id SET NOT NULL;
ALTER TABLE public.seeded_accounts ALTER COLUMN barn_id SET NOT NULL;
