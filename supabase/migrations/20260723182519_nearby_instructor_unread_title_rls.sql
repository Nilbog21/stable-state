REVOKE ALL ON FUNCTION get_unread_notification_title(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_unread_notification_title(uuid, uuid, text) TO authenticated;
