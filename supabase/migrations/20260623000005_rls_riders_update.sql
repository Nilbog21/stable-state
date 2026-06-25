CREATE POLICY "riders_update" ON public.riders
  FOR UPDATE TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));
