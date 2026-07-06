-- create_or_update_notification trusted any authenticated caller with no check that
-- they belong to the barn being notified into. EXECUTE is granted to authenticated,
-- so the RPC is reachable directly via PostgREST, not just through the Next.js
-- server action -- any logged-in user could spoof a notification for any other user
-- in any barn. Require the caller to be an active member of p_barn_id; this checks
-- the CALLER's membership, not the recipient's, so it doesn't reintroduce the
-- "recipient not guaranteed active" risk the original migration was written around.
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
    SET title = EXCLUDED.title, body = EXCLUDED.body, link = EXCLUDED.link, read_at = NULL;
END;
$$;
