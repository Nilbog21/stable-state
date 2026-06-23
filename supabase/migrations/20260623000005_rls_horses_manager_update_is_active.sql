DROP POLICY IF EXISTS "horses_manager_write" ON public.horses;

CREATE POLICY "horses_manager_write" ON public.horses
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(horses.barn_id))
  WITH CHECK (auth_is_barn_manager(horses.barn_id));
