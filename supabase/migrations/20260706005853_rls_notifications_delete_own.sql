-- notifications had SELECT/INSERT/UPDATE policies but no DELETE policy, so every
-- deleteNotificationByType call (clears stale incomplete_profile /
-- member_incomplete_profile notifications on login, added in #278) has silently
-- failed under RLS since it shipped -- the error is swallowed by a .catch(() => {})
-- at its only call site. Own-row delete matches the existing select/update
-- ownership model.
CREATE POLICY "notifications_delete_own"
  ON notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
