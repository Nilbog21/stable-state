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
REVOKE ALL ON FUNCTION public.auth_profile_is_demo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_profile_is_demo(uuid) TO authenticated;

DROP POLICY profiles_own_update ON public.profiles;
CREATE POLICY profiles_own_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND profiles.is_demo IS NOT DISTINCT FROM public.auth_profile_is_demo(profiles.id)
  );
