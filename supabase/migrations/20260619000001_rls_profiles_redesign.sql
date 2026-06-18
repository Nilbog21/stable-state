-- Refresh profiles RLS policies for the new schema shape.
-- Pre-auth rows (user_id IS NULL) are managed only by service_role, which bypasses RLS.

DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_manager_read" ON public.profiles;

-- SELECT: own row or any barn member's row (for managers)
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
        AND target.user_id = profiles.user_id
    )
  );

-- INSERT: users may only create their own row; barn_id and role must be null
-- (pre-auth rows are inserted by service_role and bypass this check)
CREATE POLICY "profiles_own_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND barn_id IS NULL AND role IS NULL);

-- UPDATE: users may only update their own row; barn_id and role stay null
CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND barn_id IS NULL AND role IS NULL);

-- DELETE: users may only delete their own row
CREATE POLICY "profiles_own_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
