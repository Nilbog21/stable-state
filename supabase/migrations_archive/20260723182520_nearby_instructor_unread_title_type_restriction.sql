-- #1017 review fix: get_unread_notification_title accepted an arbitrary
-- p_type, so any active barn member could read any other member's unread
-- notification title for any NotificationType (outstanding_payment,
-- pending_approval, etc.), not just the instructor_lesson_nearby badge
-- count this RPC exists to serve. Restrict it to that one type.
CREATE OR REPLACE FUNCTION public.get_unread_notification_title(p_user_id uuid, p_barn_id uuid, p_type text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  IF p_type <> 'instructor_lesson_nearby' THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT auth_is_active_barn_member(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT title INTO v_title
  FROM notifications
  WHERE user_id = p_user_id AND barn_id = p_barn_id AND type = p_type AND read_at IS NULL
  LIMIT 1;

  RETURN v_title;
END;
$$;
