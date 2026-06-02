DROP POLICY "horses_barn_member" ON public.horses;

-- SELECT: all active barn members (lesson form needs this)
CREATE POLICY "horses_member_read" ON public.horses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = horses.barn_id AND status = 'active'
  ));

-- INSERT/UPDATE/DELETE: managers and admins only
CREATE POLICY "horses_manager_write" ON public.horses
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND (
        mgr.role = 'admin'
        OR (mgr.role = 'manager' AND mgr.barn_id = horses.barn_id)
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND (
        mgr.role = 'admin'
        OR (mgr.role = 'manager' AND mgr.barn_id = horses.barn_id)
      )
  ));
