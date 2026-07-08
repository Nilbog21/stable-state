-- Atomically creates a managed-member stub (is_managed profile + active rider membership).
-- SECURITY DEFINER bypasses RLS; the role check inside the function enforces authorization.
-- Matches the pattern of claim_managed_member.
CREATE OR REPLACE FUNCTION create_managed_member(
  p_barn_id UUID,
  p_first_name TEXT,
  p_last_name TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id UUID;
  v_membership_id UUID;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO profiles (first_name, last_name, is_managed)
    VALUES (p_first_name, p_last_name, true)
    RETURNING id INTO v_profile_id;

  INSERT INTO barn_memberships (barn_id, profile_id, role, status, invite_token)
    VALUES (p_barn_id, v_profile_id, 'rider', 'active', gen_random_uuid())
    RETURNING id INTO v_membership_id;

  RETURN v_membership_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_managed_member(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_managed_member(UUID, TEXT, TEXT) TO authenticated;
