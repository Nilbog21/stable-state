-- Restrict profiles_manager_update to managed (stub) profiles only.
-- Once a stub account is claimed (is_managed=false), only the member
-- themselves (via profiles_own_update) can edit their own contact info.

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
    AND profiles.is_managed = true
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
    AND profiles.is_managed = true
    AND EXISTS (
      SELECT 1 FROM auth_get_profile_immutable_fields(profiles.id) AS existing
      WHERE existing.user_id IS NOT DISTINCT FROM profiles.user_id
        AND existing.email IS NOT DISTINCT FROM profiles.email
        AND existing.first_name = profiles.first_name
        AND existing.last_name = profiles.last_name
        AND existing.created_at = profiles.created_at
    )
  );
