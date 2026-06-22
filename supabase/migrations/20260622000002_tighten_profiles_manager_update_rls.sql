-- Tighten profiles_manager_update: restrict to contact fields only.
-- The original policy had no column guard; a manager could overwrite email,
-- first_name, last_name, etc. on any barn member. The WITH CHECK subquery
-- compares proposed values against the current row and rejects updates to
-- non-contact columns.
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
        AND target.user_id = profiles.user_id
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
        AND target.user_id = profiles.user_id
        AND target.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles AS existing
      WHERE existing.id = profiles.id
        AND existing.user_id IS NOT DISTINCT FROM profiles.user_id
        AND existing.email = profiles.email
        AND existing.barn_id IS NOT DISTINCT FROM profiles.barn_id
        AND existing.role IS NOT DISTINCT FROM profiles.role
        AND existing.first_name = profiles.first_name
        AND existing.last_name = profiles.last_name
        AND existing.created_at = profiles.created_at
    )
  );
