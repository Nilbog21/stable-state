-- release-4 consolidated backfills (#1629). The three statements across the squashed 62 that
-- migrate real pre-existing rows, each followed by the ALTER that depends on having run it.
-- None can be flattened into the companion ..._release4_schema.sql's final-state DDL: they act
-- on rows that exist on prod today. Same treatment #658 gave release-3's four.

-- ===========================================================================
-- #1037: self-service join requests are dead (registration is invite-only since #777).
-- Drop any leftover pending rows (dev/test seed data only, never real user data) before
-- narrowing the CHECK constraint, then narrow status to 'active' only.
DELETE FROM public.barn_memberships WHERE status = 'pending';

ALTER TABLE public.barn_memberships DROP CONSTRAINT barn_memberships_status_check;

ALTER TABLE public.barn_memberships
  ADD CONSTRAINT barn_memberships_status_check CHECK (status = 'active'::text);

ALTER TABLE public.barn_memberships ALTER COLUMN status SET DEFAULT 'active'::text;

-- ===========================================================================
-- #1148: carry the money data across the appointments/appointment_costs split. The cost table
-- is created in the schema file; these two columns are dropped only once their rows have moved.
-- Backfilled from the columns about to be dropped. A row with amount IS NULL AND
-- payment_type IS NOT NULL (an unpriced expense somehow marked paid) is a nonsense state
-- with no amount for the payment type to describe; its payment_type is intentionally
-- dropped rather than carried into a cost row that would have to invent an amount.
INSERT INTO public.appointment_costs (barn_id, appointment_id, amount, payment_type)
SELECT barn_id, id, amount, payment_type
FROM public.appointments
WHERE amount IS NOT NULL;

ALTER TABLE public.appointments
  DROP COLUMN amount,
  DROP COLUMN payment_type;

-- ===========================================================================
-- #1549: every horse has an owner. `owning_member_id` has been nullable since
-- #997 and `createHorse` only started setting it in #998, so most rows still
-- carry NULL -- which left the horse detail page rendering "No owner set" and
-- gave #1547's ownership-implies-document-access rule nobody to admit.
--
-- Backfill prefers the barn's manager and falls back to its oldest active
-- membership. A barn with no active membership can't be reached through the
-- app (creation grants the creator a manager row), but the guard below makes
-- that case fail with a sentence rather than as a bare NOT NULL violation.
UPDATE public.horses h
SET owning_member_id = (
  SELECT m.id
  FROM public.barn_memberships m
  WHERE m.barn_id = h.barn_id AND m.status = 'active'
  ORDER BY (m.role = 'manager') DESC, m.created_at ASC
  LIMIT 1
)
WHERE h.owning_member_id IS NULL;

DO $$
DECLARE
  v_ownerless int;
BEGIN
  SELECT count(*) INTO v_ownerless FROM public.horses WHERE owning_member_id IS NULL;
  IF v_ownerless > 0 THEN
    RAISE EXCEPTION
      'cannot make horses.owning_member_id NOT NULL: % horse(s) sit in a barn with no active membership to own them', v_ownerless;
  END IF;
END $$;

ALTER TABLE public.horses ALTER COLUMN owning_member_id SET NOT NULL;

