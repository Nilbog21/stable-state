-- Allow managed-member inserts for any role, not just rider (#495).
-- The create_managed_member RPC is SECURITY DEFINER and bypasses this policy;
-- updated so any future direct-insert path matches the generalized RPC.
DROP POLICY "barn_memberships_manager_insert_managed" ON public.barn_memberships;

CREATE POLICY "barn_memberships_manager_insert_managed" ON public.barn_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL
    AND invite_token IS NOT NULL
    AND status = 'active'
    AND role IN ('rider', 'trainer', 'manager')
    AND auth_is_barn_manager(barn_memberships.barn_id)
  );
