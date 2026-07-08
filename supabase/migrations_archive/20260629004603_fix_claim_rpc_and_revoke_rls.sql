-- Fix claim_managed_member: only reject if the SPECIFIC stub being claimed is already linked,
-- not if the caller has any profile at all (which would block cross-barn claiming).
-- Also accept nullable email so OAuth users without an email don't write empty string.
CREATE OR REPLACE FUNCTION claim_managed_member(
  p_token UUID,
  p_user_id UUID,
  p_email TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id UUID;
  v_membership_id UUID;
BEGIN
  SELECT id, profile_id
    INTO v_membership_id, v_profile_id
  FROM barn_memberships
  WHERE invite_token = p_token;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'token_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_profile_id AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'user_already_claimed';
  END IF;

  UPDATE profiles
    SET user_id = p_user_id, email = p_email, is_managed = false
  WHERE id = v_profile_id;

  UPDATE barn_memberships
    SET user_id = p_user_id, invite_token = NULL
  WHERE id = v_membership_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_managed_member(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_managed_member(UUID, UUID, TEXT) TO authenticated;

-- Allow managers to regenerate invite_token on active managed-member rows.
-- Needed by revokeInviteToken in barn-memberships.ts.
CREATE POLICY "barn_memberships_manager_update_invite_token" ON public.barn_memberships
  FOR UPDATE TO authenticated
  USING (
    user_id IS NULL
    AND status = 'active'
    AND auth_is_barn_manager(barn_memberships.barn_id)
  )
  WITH CHECK (
    user_id IS NULL
    AND status = 'active'
    AND auth_is_barn_manager(barn_memberships.barn_id)
  );
