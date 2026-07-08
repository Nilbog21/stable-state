-- Managers and admin can SELECT all memberships in their barn.
-- The subquery reads the actor's own row, which is permitted by the
-- existing barn_memberships_read_own policy, so there is no recursion.
CREATE POLICY "barn_memberships_manager_read_barn" ON public.barn_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships mgr
      WHERE mgr.user_id = auth.uid()
        AND mgr.status = 'active'
        AND (
          mgr.role = 'admin'
          OR (mgr.role = 'manager' AND mgr.barn_id = barn_memberships.barn_id)
        )
    )
  );

-- Managers and admin can update a pending membership to active.
CREATE POLICY "barn_memberships_manager_approve" ON public.barn_memberships
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships mgr
      WHERE mgr.user_id = auth.uid()
        AND mgr.status = 'active'
        AND (
          mgr.role = 'admin'
          OR (mgr.role = 'manager' AND mgr.barn_id = barn_memberships.barn_id)
        )
    )
  )
  WITH CHECK (status = 'active');

-- Managers can delete pending memberships in their barn; admin can delete any.
CREATE POLICY "barn_memberships_manager_delete" ON public.barn_memberships
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships mgr
      WHERE mgr.user_id = auth.uid()
        AND mgr.status = 'active'
        AND (
          mgr.role = 'admin'
          OR (
            mgr.role = 'manager'
            AND mgr.barn_id = barn_memberships.barn_id
            AND barn_memberships.status = 'pending'
          )
        )
    )
  );

-- Managers and admin can read profiles of other users (needed to display
-- names on the approvals list). Extends the existing profiles_own policy.
CREATE POLICY "profiles_manager_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships
      WHERE user_id = auth.uid()
        AND status = 'active'
        AND role IN ('manager', 'admin')
    )
  );
