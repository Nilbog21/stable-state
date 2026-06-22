-- Users can SELECT their own notifications
CREATE POLICY "notifications_select_own"
  ON notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Any authenticated user can INSERT notifications; permissive by design so server actions can notify other users
CREATE POLICY "notifications_insert_authenticated"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can UPDATE (mark read) only their own notifications
CREATE POLICY "notifications_update_own"
  ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
