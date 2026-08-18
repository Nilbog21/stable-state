-- #1158: six SECURITY DEFINER functions carry no REVOKE … FROM PUBLIC / GRANT … TO
-- authenticated pair anywhere in the live migration set, so a from-scratch replay leaves them
-- with Postgres' default PUBLIC EXECUTE and reachable via PostgREST with the anon key.
--
-- Five are hardening-only. auth_is_barn_manager, auth_is_any_barn_manager,
-- auth_is_barn_trainer and auth_can_read_barn_member_profile are caller-scoped booleans over
-- auth.uid(), so PUBLIC EXECUTE buys an anon caller nothing — they are just inconsistent with
-- the ~20 later auth_* helpers that do carry the pair. set_instructor_cut had the pair in
-- migrations_archive/20260706005857_rpc_set_instructor_cut.sql, but the #972 squash re-listed
-- ~30 pairs in 20260716005944_release3_rls.sql and dropped this one; dev/prod retain the
-- pre-squash ACL (CREATE OR REPLACE does not reset grants), so it was replay-only, and its
-- in-body auth_is_barn_manager check rejects every non-manager caller regardless.
--
-- auth_get_profile_immutable_fields is the one that matters, and is live in prod today — it
-- never had a grant statement in any migration, including the archive. It is a bare
-- SELECT user_id, email, first_name, last_name, created_at FROM profiles WHERE id = p_id with
-- profiles RLS bypassed and no auth check of any kind, so it needs an in-body guard as well as
-- the grant: the grant alone would only narrow it from "anyone with the anon key" to "any
-- authenticated user", and a logged-in rider posting an arbitrary profile UUID at it would
-- still get an email back.

-- The guard is auth_can_read_barn_member_profile, the sibling SECURITY DEFINER helper already
-- backing profiles_barn_members_read, so the function's reach becomes exactly "profiles you
-- could already SELECT" — all it ever needed, since its job is breaking the
-- profiles-policy-queries-profiles recursion, not widening access. That helper is DEFINER over
-- barn_memberships and never touches profiles, so no recursion is reintroduced.
--
-- Its only live caller is profiles_manager_update's WITH CHECK
-- (20260716005944_release3_rls.sql), inside an expression that has already asserted the caller
-- is an active manager of a barn the target belongs to — so the guard rejects nothing
-- legitimate.
--
-- profiles_barn_members_read pairs the helper with an `auth.uid() = user_id` branch, for a user
-- reading their own profile from outside any barn. That branch is omitted here because it is
-- unreachable: profiles_manager_update requires is_managed = true, and claim_managed_member
-- sets user_id and is_managed = false in the same UPDATE, so an is_managed = true row always
-- has user_id IS NULL and `auth.uid() = user_id` can never hold for a row this helper is
-- reached for.
CREATE OR REPLACE FUNCTION public.auth_get_profile_immutable_fields(p_id uuid) RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT user_id, email, first_name, last_name, created_at
  FROM public.profiles
  WHERE id = p_id
    AND public.auth_can_read_barn_member_profile(p_id);
$$;

REVOKE ALL ON FUNCTION public.auth_get_profile_immutable_fields(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_get_profile_immutable_fields(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_barn_manager(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_barn_manager(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_any_barn_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_any_barn_manager() TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_barn_trainer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_barn_trainer(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_can_read_barn_member_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_read_barn_member_profile(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.set_instructor_cut(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_instructor_cut(uuid, numeric) TO authenticated;
