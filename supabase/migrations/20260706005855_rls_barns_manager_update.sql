CREATE POLICY "manager_update_barns" ON barns
  FOR UPDATE TO authenticated
  USING (auth_is_barn_manager(id))
  WITH CHECK (auth_is_barn_manager(id));
