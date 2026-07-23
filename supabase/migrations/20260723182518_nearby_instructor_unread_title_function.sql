-- #1017 review fix: getUnreadNotificationCount previously read another
-- recipient's unread notification row directly via the caller's session
-- client, but notifications_select_own RLS (user_id = auth.uid()) only
-- allows reading your own rows -- so a trainer/manager submitting a lesson
-- always got 0 back for a different recipient, and each new
-- instructor_lesson_nearby event overwrote the badge instead of
-- incrementing it. Gated the same way sync_lesson_transactions and
-- get_active_barn_member_summaries are: skip the membership check when
-- auth.uid() IS NULL so the service-role caller (generate-recurring-lessons.ts)
-- keeps working unchanged.
CREATE FUNCTION public.get_unread_notification_title(p_user_id uuid, p_barn_id uuid, p_type text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
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
