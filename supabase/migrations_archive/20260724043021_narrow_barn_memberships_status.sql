-- #1037: self-service join requests are dead (registration is invite-only since #777).
-- Drop any leftover pending rows (dev/test seed data only, never real user data) before
-- narrowing the CHECK constraint, then narrow status to 'active' only.
DELETE FROM public.barn_memberships WHERE status = 'pending';

ALTER TABLE public.barn_memberships DROP CONSTRAINT barn_memberships_status_check;

ALTER TABLE public.barn_memberships
  ADD CONSTRAINT barn_memberships_status_check CHECK (status = 'active'::text);

ALTER TABLE public.barn_memberships ALTER COLUMN status SET DEFAULT 'active'::text;
