-- create_or_update_notification's DO UPDATE unconditionally reset read_at to NULL
-- on every upsert, even when title/body/link were unchanged from the existing row.
-- incomplete_profile/member_incomplete_profile notifications are re-upserted on every
-- login, so a previously-read notification of one of these types flipped back to
-- unread on the next login. Only reset read_at when the content actually changed.
CREATE OR REPLACE FUNCTION create_or_update_notification(
  p_user_id UUID,
  p_barn_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_link TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid() AND barn_id = p_barn_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO notifications (user_id, barn_id, type, title, body, link, read_at)
  VALUES (p_user_id, p_barn_id, p_type, p_title, p_body, p_link, NULL)
  ON CONFLICT (user_id, barn_id, type) DO UPDATE
    SET title = EXCLUDED.title,
        body = EXCLUDED.body,
        link = EXCLUDED.link,
        read_at = CASE
          WHEN notifications.title IS DISTINCT FROM EXCLUDED.title
            OR notifications.body IS DISTINCT FROM EXCLUDED.body
            OR notifications.link IS DISTINCT FROM EXCLUDED.link
          THEN NULL
          ELSE notifications.read_at
        END;
END;
$$;
