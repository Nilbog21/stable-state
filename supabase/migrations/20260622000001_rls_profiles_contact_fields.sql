-- Expand SELECT to include trainers (was manager-only).
DROP POLICY IF EXISTS "profiles_manager_read" ON public.profiles;
CREATE POLICY "profiles_barn_members_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role IN ('manager', 'trainer')
        AND target.user_id = profiles.user_id
    )
  );

-- Allow managers to UPDATE any active barn member's contact info.
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
  );
