-- Fix: profiles_own_update WITH CHECK was rejecting manager/trainer rows
-- that have non-null barn_id/role (set by seedManagerProfile).
-- The app never writes barn_id or role via updateProfile, so the null guard is unnecessary.
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
