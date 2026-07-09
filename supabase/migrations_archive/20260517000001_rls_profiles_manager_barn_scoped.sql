-- Tighten profiles_manager_read: managers may only read profiles of users
-- who share the same barn, not all profiles globally. Admin retains global
-- read access since they manage all barns.
DROP POLICY "profiles_manager_read" ON public.profiles;

CREATE POLICY "profiles_manager_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships
      WHERE user_id = auth.uid()
        AND status = 'active'
        AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.user_id = profiles.user_id
    )
  );
