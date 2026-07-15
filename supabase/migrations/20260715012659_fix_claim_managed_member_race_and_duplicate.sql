-- #887 review follow-up: close two gaps in the multi-barn merge fix
-- (20260714000519_fix_claim_managed_member_multi_barn.sql):
-- (1) two concurrent claims of different invites by the same real person could
--     both read "no existing profile yet" before either commits, re-triggering
--     the original unique-violation; an advisory lock keyed on p_user_id
--     serializes them.
-- (2) claiming an invite for a barn the caller already belongs to hit a raw,
--     uncaught unique-violation on barn_memberships(user_id, barn_id) instead
--     of a purpose-built exception like the function's other failure modes.
CREATE OR REPLACE FUNCTION public.claim_managed_member(p_token uuid, p_user_id uuid, p_email text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_profile_id UUID;
  v_membership_id UUID;
  v_barn_id UUID;
  v_existing_profile_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT id, profile_id, barn_id
    INTO v_membership_id, v_profile_id, v_barn_id
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
    IF EXISTS (
      SELECT 1 FROM barn_memberships
      WHERE user_id = p_user_id AND barn_id = v_barn_id
    ) THEN
      RAISE EXCEPTION 'already_member_of_barn';
    END IF;

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
