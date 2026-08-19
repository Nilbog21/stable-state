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

-- ON DELETE SET NULL is now unreachable by construction -- with the column NOT
-- NULL it can only ever raise, and the message it raises names a constraint
-- nobody deleting a member would connect to horses. RESTRICT says what actually
-- happened. `removeMemberAction` pre-checks and refuses with the horses named,
-- so this is the backstop for a direct DB delete rather than the user-facing
-- path.
--
-- Safe against the two teardown paths: `teardownBarnData`/`teardownAllData`
-- (src/lib/db/service-role.ts) both delete horses before barn_memberships.
-- Deleting a `barns` row while its horses still exist relies on the order
-- Postgres happens to cascade in and can now trip this -- direct DB access
-- only; nothing in the app deletes a barn.
ALTER TABLE public.horses DROP CONSTRAINT horses_barn_id_owning_member_id_fkey;
ALTER TABLE public.horses
  ADD CONSTRAINT horses_barn_id_owning_member_id_fkey
  FOREIGN KEY (barn_id, owning_member_id) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE RESTRICT;
