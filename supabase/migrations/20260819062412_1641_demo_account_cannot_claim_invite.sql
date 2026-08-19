-- #1641 — SECURITY: a /demo session makes a later invite claim bind to the shared demo account.
--
-- One file, per the patch-migration convention (CLAUDE.md's Patch Workflow) -- a patch ships
-- as one indivisible fix, so its schema, functions and RLS have no separate life to justify
-- the separate files a feature's migrations get.
--
-- 1. `profiles.is_demo`
-- 2. `claim_managed_member` refuses a demo session; `auth_profile_is_demo` helper for part 3
-- 3. the two policies that stop the flagged account clearing its own flag

-- ---------------------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------------------

-- #1641: `profiles.is_demo` marks the shared `/demo` account, so `claim_managed_member` can
-- refuse to bind a real barn's invite stub to it. `/demo` signs every visitor in as one shared
-- account with an ordinary site-wide session, and until this column there was nothing at the DB
-- layer that could tell that session apart from a real user's.
--
-- Written only by service-role callers (`scripts/setup-demo-user.ts` at bootstrap,
-- `createOrResumeDemoBarn` self-healingly on the first `/demo` visit after deploy). Part 3 pins
-- it against a self-update, so the flagged account cannot clear its own flag with the anon key.
ALTER TABLE public.profiles ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------------------
-- 2. Functions
-- ---------------------------------------------------------------------------------------

-- `claim_managed_member` is the one chokepoint both claim callers share — `acceptInvite`
-- (`register/actions.ts`) and `/auth/callback`'s invite-token branch — so the block lives here
-- rather than being written twice in app code. Body is the release-3 definition
-- (20260716005943_release3_functions.sql) with one added guard, sited ahead of the token lookup
-- rather than beside the sibling `already_member_of_barn` raise it otherwise mirrors — see the
-- guard's own comment for why the ordering matters.
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

REVOKE ALL ON FUNCTION public.auth_profile_is_demo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_profile_is_demo(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------------------

-- #1641: pin `profiles.is_demo` against a self-update.
--
-- Without this the RPC block is bypassable by exactly the account it targets: `/demo`'s session
-- is an ordinary authenticated session, and `profiles_own_update` admitted any write to the
-- caller's own row — so the shared demo account could PATCH `is_demo` back to false with the
-- anon key and then claim. The added clause compares the incoming row against the stored value
-- via a SECURITY DEFINER read, the same shape `profiles_manager_update` already uses with
-- `auth_get_profile_immutable_fields`.
--
-- ponytail: `profiles_manager_update` is deliberately left alone. It gates on
-- `is_managed = true`, so it can only ever see an unclaimed stub — never the demo profile, which
-- `claim_managed_member` would have cleared `is_managed` on. Pin it too if a future policy ever
-- lets a manager write a claimed row.
DROP POLICY profiles_own_update ON public.profiles;
CREATE POLICY profiles_own_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND profiles.is_demo IS NOT DISTINCT FROM public.auth_profile_is_demo(profiles.id)
  );

-- #1641: close the DELETE-then-INSERT route around the pin above.
--
-- The UPDATE pin stops the demo session *editing* its flag away, but `profiles_own_delete`
-- carried no constraint at all, so the same anon-key session could take the row out and put a
-- fresh one back with `is_demo` at its `false` default. `barn_memberships_write_own` has no
-- `FOR` clause, so it is `FOR ALL` and the demo session can clear the
-- `barn_memberships.profile_id` references first (that FK has no CASCADE), which is what made
-- the chain reachable rather than blocked by a constraint error.
--
-- ponytail: the DELETE is the only half that needs closing. `profiles_user_id_unique` means the
-- replacement row cannot be inserted while the original is still there, so `profiles_own_insert`
-- stays as it is and `barn_memberships_write_own` keeps its `FOR ALL` breadth — a member removing
-- themselves from a barn is a supported thing to do, and it is only load-bearing here as a step
-- towards the profile delete this policy now refuses.
--
-- No helper function, unlike the UPDATE pin: a DELETE policy's USING reads the row being deleted,
-- so naming the column directly neither recurses nor needs a SECURITY DEFINER old-row read.
DROP POLICY profiles_own_delete ON public.profiles;
CREATE POLICY profiles_own_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_demo IS NOT TRUE);
