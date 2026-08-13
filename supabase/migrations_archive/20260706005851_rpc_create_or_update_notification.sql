-- Bypasses RLS for notification upserts. The ON CONFLICT clause makes Postgres
-- check the row proposed for insertion against the table's SELECT policy
-- (notifications_select_own, user_id = auth.uid()) and throw rather than silently
-- skip, which blocks every notification created for a user other than the caller
-- on the first send, before any conflicting row exists; on a re-send the DO UPDATE
-- path additionally fails the UPDATE policy's USING (notifications_update_own).
-- See docs/architecture/rpc/notifications.md and #1445. This function is the
-- sole write path for createNotification; no additional authorization checks are
-- added since notifications_insert_authenticated is already permissive by design
-- (WITH CHECK true) -- the calling server action has already authorized the
-- recipient.
CREATE OR REPLACE FUNCTION create_or_update_notification(
  p_user_id UUID,
  p_barn_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_link TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, barn_id, type, title, body, link, read_at)
  VALUES (p_user_id, p_barn_id, p_type, p_title, p_body, p_link, NULL)
  ON CONFLICT (user_id, barn_id, type) DO UPDATE
    SET title = EXCLUDED.title, body = EXCLUDED.body, link = EXCLUDED.link, read_at = NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_or_update_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_or_update_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
