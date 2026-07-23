-- #1018: personalized .ics calendar export — token -> membership -> role-filtered schedule,
-- all in one SECURITY DEFINER round trip. Anon-callable since a calendar poller carries no
-- session; the token itself is the authorization. A single function (rather than a "resolve
-- token" RPC plus a separate "fetch items" RPC taking raw barn/role params) keeps the only
-- anon-reachable surface unable to accept attacker-supplied barn_id/role directly.
CREATE FUNCTION public.get_calendar_feed(p_token text)
RETURNS TABLE(valid boolean, barn_name text, items jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH resolved AS (
    SELECT bm.id AS membership_id, bm.barn_id, bm.role::text AS role
    FROM barn_memberships bm
    WHERE bm.calendar_feed_token = p_token AND bm.status = 'active'
  ),
  -- ponytail: unbounded query (no date range), add a rolling window if payload size becomes
  -- a real problem — simplest correct thing today, barn lesson volume is small.
  lesson_items AS (
    SELECT jsonb_build_object(
      'itemType', 'lesson',
      'id', l.id,
      'title', l.tier_name || CASE WHEN l.jumping THEN ' (Jumping)' ELSE '' END,
      'startsAt', l.lesson_at,
      'durationMinutes', 60,
      'notes', NULL
    ) AS item
    FROM lessons l, resolved r
    WHERE l.barn_id = r.barn_id AND l.cancelled_at IS NULL
      AND (
        r.role = 'manager'
        OR (r.role = 'trainer' AND l.instructor_id = r.membership_id)
        OR (r.role = 'rider' AND EXISTS (
              SELECT 1 FROM lesson_riders lr
              WHERE lr.lesson_id = l.id AND lr.rider_id = r.membership_id AND lr.cancelled_at IS NULL
            ))
      )
  ),
  event_items AS (
    SELECT jsonb_build_object(
      'itemType', 'event',
      'id', e.id,
      'title', e.title,
      'startsAt', e.event_at,
      'durationMinutes', 0,
      'notes', e.notes
    ) AS item
    FROM barn_events e, resolved r
    WHERE e.barn_id = r.barn_id AND (r.role = 'manager' OR r.role = ANY (e.visible_to_roles))
  )
  SELECT
    EXISTS (SELECT 1 FROM resolved) AS valid,
    (SELECT b.name FROM barns b JOIN resolved r ON b.id = r.barn_id) AS barn_name,
    COALESCE(
      (SELECT jsonb_agg(item) FROM (SELECT item FROM lesson_items UNION ALL SELECT item FROM event_items) all_items),
      '[]'::jsonb
    ) AS items;
$$;

REVOKE ALL ON FUNCTION public.get_calendar_feed(p_token text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_calendar_feed(p_token text) TO anon, authenticated;
