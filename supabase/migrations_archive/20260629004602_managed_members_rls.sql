-- Update RLS policies to join profiles via profile_id instead of user_id.
-- Before this change, managed member profiles (user_id = NULL) were invisible to
-- all read policies since the join condition `target.user_id = profiles.user_id`
-- is never true when profiles.user_id is NULL.

-- profiles: all active barn members can read barn-member profiles (managers, trainers, riders)
DROP POLICY IF EXISTS "profiles_barn_members_read" ON public.profiles;
CREATE POLICY "profiles_barn_members_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role IN ('manager', 'trainer', 'rider')
        AND target.profile_id = profiles.id
    )
  );

-- profiles: managers can read profiles in their barn
DROP POLICY IF EXISTS "profiles_manager_read" ON public.profiles;
CREATE POLICY "profiles_manager_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.profile_id = profiles.id
    )
  );

-- profiles: managers can update contact fields of barn members
DROP POLICY IF EXISTS "profiles_manager_update" ON public.profiles;
CREATE POLICY "profiles_manager_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.profile_id = profiles.id
        AND target.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.profile_id = profiles.id
        AND target.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM auth_get_profile_immutable_fields(profiles.id) AS existing
      WHERE existing.user_id IS NOT DISTINCT FROM profiles.user_id
        AND existing.email IS NOT DISTINCT FROM profiles.email
        AND existing.first_name = profiles.first_name
        AND existing.last_name = profiles.last_name
        AND existing.created_at = profiles.created_at
    )
  );
