-- Generalize create_managed_member to accept any role (was hardcoded to 'rider').
-- Sets can_instruct = true for trainer stubs, matching activation behavior.
-- Role validity is enforced by the barn_memberships.role FK to roles.
DROP FUNCTION create_managed_member(UUID, TEXT, TEXT);

CREATE FUNCTION create_managed_member(
  p_barn_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_role TEXT
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

  INSERT INTO barn_memberships (barn_id, profile_id, role, status, invite_token, can_instruct)
    VALUES (p_barn_id, v_profile_id, p_role, 'active', gen_random_uuid(), p_role = 'trainer')
    RETURNING id INTO v_membership_id;

  RETURN v_membership_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_managed_member(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_managed_member(UUID, TEXT, TEXT, TEXT) TO authenticated;
