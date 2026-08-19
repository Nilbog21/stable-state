-- #1641: the claim-side half of the demo-account block, plus the helper the companion RLS
-- migration needs to pin `profiles.is_demo`.

-- `claim_managed_member` is the one chokepoint both claim callers share — `acceptInvite`
-- (`register/actions.ts`) and `/auth/callback`'s invite-token branch — so the block lives here
-- rather than being written twice in app code. Body is the release-3 definition
-- (20260716005943_release3_functions.sql) with one added guard, sited next to the sibling
-- `already_member_of_barn` raise it mirrors.
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

  -- #1641. Raised before the token is looked up, so a demo session cannot spend a real barn's
  -- single-use invite. Callers translate this message specifically; surfacing it as the generic
  -- claim failure would tell the claimant the invite expired, when in fact the invite is fine
  -- and the session is wrong.
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = p_user_id AND is_demo) THEN
    RAISE EXCEPTION 'demo_account_cannot_claim';
  END IF;

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

-- Reads the stored `is_demo` for a profile so `profiles_own_update`'s WITH CHECK can compare the
-- incoming row against it. SECURITY DEFINER for the same reason `auth_get_profile_immutable_fields`
-- is: a policy on `profiles` cannot read `profiles` without recursing.
CREATE FUNCTION public.auth_profile_is_demo(p_id uuid) RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
  SELECT is_demo FROM public.profiles WHERE id = p_id;
$$;
