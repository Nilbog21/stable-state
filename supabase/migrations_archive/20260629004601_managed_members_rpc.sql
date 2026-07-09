-- Atomically links an auth user to a managed member profile + membership.
-- Raises 'token_not_found' if invite_token doesn't match any membership.
-- Raises 'user_already_claimed' if p_user_id already has a profile row.
CREATE OR REPLACE FUNCTION claim_managed_member(
  p_token UUID,
  p_user_id UUID,
  p_email TEXT
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

  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id) THEN
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
