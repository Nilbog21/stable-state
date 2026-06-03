-- Convert any seeded admin accounts to barn-scoped manager of the sme barn.
UPDATE public.seeded_accounts
  SET role = 'manager',
      barn_id = (SELECT id FROM public.barns WHERE slug = 'sme')
  WHERE role = 'admin';

-- Convert any existing admin barn_memberships (barn_id IS NULL) to manager of the sme barn.
UPDATE public.barn_memberships
  SET role = 'manager',
      barn_id = (SELECT id FROM public.barns WHERE slug = 'sme')
  WHERE role = 'admin' AND barn_id IS NULL;

-- Remove admin from the roles lookup table.
DELETE FROM public.roles WHERE name = 'admin';

-- Tighten the roles CHECK constraint to exclude admin.
ALTER TABLE public.roles DROP CONSTRAINT roles_name_check;
ALTER TABLE public.roles ADD CONSTRAINT roles_name_check
  CHECK (name IN ('manager', 'trainer', 'rider'));

-- Now that no NULL barn_id rows remain, enforce NOT NULL on both tables.
ALTER TABLE public.barn_memberships ALTER COLUMN barn_id SET NOT NULL;
ALTER TABLE public.seeded_accounts ALTER COLUMN barn_id SET NOT NULL;
