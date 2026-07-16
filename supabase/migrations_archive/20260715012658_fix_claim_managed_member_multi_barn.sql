-- #887: claim_managed_member unconditionally set profiles.user_id on the invite's own
-- stub profile, which throws a unique-violation when the invitee already owns a profile
-- from another barn (profiles.user_id is globally unique). Merge into the existing
-- profile instead: re-point the claiming membership to it and drop the orphaned stub.
CREATE OR REPLACE FUNCTION public.claim_managed_member(p_token uuid, p_user_id uuid, p_email text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_profile_id UUID;
  v_membership_id UUID;
  v_existing_profile_id UUID;
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

  SELECT id INTO v_existing_profile_id FROM profiles WHERE user_id = p_user_id;

  IF v_existing_profile_id IS NOT NULL THEN
    UPDATE barn_memberships
      SET user_id = p_user_id, invite_token = NULL, profile_id = v_existing_profile_id
    WHERE id = v_membership_id;

    DELETE FROM profiles WHERE id = v_profile_id;
  ELSE
    UPDATE profiles
      SET user_id = p_user_id, email = p_email, is_managed = false
    WHERE id = v_profile_id;

    UPDATE barn_memberships
      SET user_id = p_user_id, invite_token = NULL
    WHERE id = v_membership_id;
  END IF;
END;
$$;
