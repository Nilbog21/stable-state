-- Extend riders INSERT policy to allow global admins in addition to barn managers.
DROP POLICY "riders_insert" ON public.riders;

CREATE POLICY "riders_insert" ON public.riders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barn_memberships
      WHERE user_id = auth.uid() AND barn_id = riders.barn_id
        AND status = 'active' AND role = 'manager'
    )
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships
      WHERE user_id = auth.uid() AND barn_id IS NULL
        AND status = 'active' AND role = 'admin'
    )
  );
