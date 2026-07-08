-- Allow active barn managers to insert stub (is_managed) profiles and their memberships.
-- Needed so createManagedMemberAction can run under the manager's session (SSR client).

-- Helper: true if the calling user is an active manager of any barn.
CREATE OR REPLACE FUNCTION auth_is_any_barn_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid()
      AND role = 'manager'
      AND status = 'active'
  );
$$;

-- profiles: managers may insert stub profiles (is_managed=true, no user_id, no email)
CREATE POLICY "profiles_manager_insert_managed" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_managed = true AND user_id IS NULL AND auth_is_any_barn_manager());

-- barn_memberships: managers may insert active rider memberships for managed members
CREATE POLICY "barn_memberships_manager_insert_managed" ON public.barn_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL
    AND invite_token IS NOT NULL
    AND status = 'active'
    AND role = 'rider'
    AND auth_is_barn_manager(barn_memberships.barn_id)
  );
