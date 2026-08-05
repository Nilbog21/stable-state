-- #1286: two aggregate/set-returning functions whose results feed a rendered list had no
-- ORDER BY, so their row order was whatever the planner produced. Both are CREATE OR REPLACE
-- with the body otherwise copied verbatim from their current definitions, so the existing
-- GRANT EXECUTE stays (CREATE OR REPLACE never resets it) and no signature changes.
--
-- 1. get_calendar_feed's jsonb_agg over the lesson/event UNION ALL — harmless to calendar
--    clients (they sort by DTSTART themselves), but any diff-based test of the feed would
--    otherwise be built on sand. Ordered chronologically, by start instant.
-- 2. get_horse_projected_exhaustion — ExhaustionBar renders one <li> per returned row,
--    showing the lesson's date. Same chronological ruling.
--
-- The name lists the app renders sort alphabetically instead (matching getHorsesByBarn's
-- ORDER BY h.name); those all live in TypeScript and need no migration. The inner string_agg
-- calls below were already ordered by name and are unchanged.

-- Ordering note (get_calendar_feed): both CTEs now carry the raw `starts_at` timestamptz
-- alongside the built jsonb object, and the aggregate orders on that column rather than on
-- item->>'startsAt'. Sorting the rendered text would only agree with chronological order
-- while every value happens to render at the same UTC offset, which is a property of the
-- session's TimeZone setting rather than of this function. `item->>'id'` breaks ties so a
-- lesson and an event at the same instant come out in a fixed order too.
CREATE OR REPLACE FUNCTION public.get_calendar_feed(p_token text)
RETURNS TABLE(valid boolean, barn_name text, items jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH resolved AS (
    SELECT bm.id AS membership_id, bm.barn_id, bm.role::text AS role
    FROM barn_memberships bm
    WHERE bm.calendar_feed_token = p_token AND bm.status = 'active'
  ),
  -- Unbounded query (no date range) — simplest correct thing today, barn lesson volume
  -- is small; add a rolling window if payload size becomes a real problem.
  lesson_items AS (
    SELECT l.lesson_at AS starts_at, jsonb_build_object(
      'itemType', 'lesson',
      'id', l.id,
      -- Compact title (fits a calendar grid cell): rider shown as "First L." for a normal
      -- lesson, since a normal lesson always has exactly one rider/horse (enforced by the
      -- deferred enforce_lesson_participant_counts() constraint trigger); group lessons
      -- just say "Group" rather than listing every rider/horse in the grid view.
      'title', 'Lesson - ' || CASE
        WHEN l.lesson_type = 'group' THEN 'Group'
        ELSE names.rider_initials || ', ' || names.horse_names
      END || CASE WHEN l.jumping THEN ' (Jumping)' ELSE '' END,
      'startsAt', l.lesson_at,
      -- hardcoded to match schedule.ts's LESSON_DURATION_MINUTES — SQL can't reference a
      -- TS constant, so keep the two in sync by hand if lesson duration ever becomes
      -- configurable.
      'durationMinutes', 60,
      -- Full detail for the DESCRIPTION field (shown on open, not in the grid): trainer
      -- name always included (even though a trainer already knows their own lessons, it's
      -- simpler to include it for every viewer than to special-case it away), full rider
      -- and horse lists for group lessons. Trainer line omitted (not "Unassigned") when
      -- instructor_id IS NULL, mirroring LessonListItem.tsx's own instructor_name display.
      'notes', array_to_string(
        array_remove(
          ARRAY[
            CASE WHEN names.trainer_name IS NOT NULL THEN 'Trainer: ' || names.trainer_name END,
            (CASE WHEN l.lesson_type = 'group' THEN 'Riders: ' ELSE 'Rider: ' END) || names.rider_names,
            (CASE WHEN l.lesson_type = 'group' THEN 'Horses: ' ELSE 'Horse: ' END) || names.horse_names
          ],
          NULL
        ),
        E'\n'
      )
    ) AS item
    FROM lessons l, resolved r,
    LATERAL (
      SELECT
        (
          SELECT tp.first_name || ' ' || tp.last_name
          FROM barn_memberships tbm
          JOIN profiles tp ON tp.id = tbm.profile_id
          WHERE tbm.id = l.instructor_id
        ) AS trainer_name,
        (
          SELECT string_agg(p.first_name || ' ' || p.last_name, ', ' ORDER BY p.first_name, p.last_name)
          FROM lesson_riders lr2
          JOIN barn_memberships bm2 ON bm2.id = lr2.rider_id
          JOIN profiles p ON p.id = bm2.profile_id
          WHERE lr2.lesson_id = l.id AND lr2.cancelled_at IS NULL
        ) AS rider_names,
        (
          SELECT string_agg(p.first_name || ' ' || left(p.last_name, 1) || '.', ', ' ORDER BY p.first_name, p.last_name)
          FROM lesson_riders lr2
          JOIN barn_memberships bm2 ON bm2.id = lr2.rider_id
          JOIN profiles p ON p.id = bm2.profile_id
          WHERE lr2.lesson_id = l.id AND lr2.cancelled_at IS NULL
        ) AS rider_initials,
        (
          SELECT string_agg(h.name, ', ' ORDER BY h.name)
          FROM lesson_horses lh2
          JOIN horses h ON h.id = lh2.horse_id
          WHERE lh2.lesson_id = l.id
        ) AS horse_names
    ) names
    WHERE l.barn_id = r.barn_id AND l.cancelled_at IS NULL
      AND (
        r.role = 'manager'
        OR (r.role = 'trainer' AND l.instructor_id = r.membership_id)
        -- rider sees own enrolled lessons plus, mirroring auth_lesson_has_privileged_horse
        -- (#997), any lesson involving a horse they hold lesson_read_privileges on — that
        -- helper checks auth.uid(), which is unavailable to this anon-token-authenticated
        -- caller, so the same join is inlined here against r.membership_id instead.
        OR (r.role = 'rider' AND (
              EXISTS (
                SELECT 1 FROM lesson_riders lr
                WHERE lr.lesson_id = l.id AND lr.rider_id = r.membership_id AND lr.cancelled_at IS NULL
              )
              OR EXISTS (
                SELECT 1 FROM lesson_horses lh
                JOIN member_horse_privileges mhp
                  ON mhp.horse_id = lh.horse_id AND mhp.barn_id = lh.barn_id
                WHERE lh.lesson_id = l.id AND lh.barn_id = r.barn_id
                  AND mhp.member_id = r.membership_id AND mhp.barn_id = r.barn_id
                  AND mhp.lesson_read_privileges = true
              )
            ))
      )
  ),
  event_items AS (
    SELECT e.event_at AS starts_at, jsonb_build_object(
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
      (
        SELECT jsonb_agg(item ORDER BY starts_at, item->>'id')
        FROM (
          SELECT starts_at, item FROM lesson_items
          UNION ALL
          SELECT starts_at, item FROM event_items
        ) all_items
      ),
      '[]'::jsonb
    ) AS items;
$$;

-- Ordering note (get_horse_projected_exhaustion): ExhaustionBar lists the returned rows as
-- "<date> — <exertion>", so they read as a schedule and belong in chronological order.
-- Body is otherwise unchanged from 20260722222910_member_horse_privileges_functions.sql,
-- which added the third (#997 privileged-rider) authorization branch.
CREATE OR REPLACE FUNCTION public.get_horse_projected_exhaustion(
  p_horse_id UUID,
  p_barn_id UUID,
  p_target_date TIMESTAMPTZ,
  p_exclude_lesson_id UUID DEFAULT NULL
)
RETURNS TABLE (lesson_at TIMESTAMPTZ, exertion_level SMALLINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR auth_is_barn_trainer(p_barn_id)
    OR auth_has_horse_lesson_read_privilege(p_horse_id, p_barn_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT l.lesson_at, lh.exertion_level
  FROM lesson_horses lh
  JOIN lessons l ON l.id = lh.lesson_id AND l.barn_id = p_barn_id
  WHERE lh.horse_id = p_horse_id
    AND lh.barn_id = p_barn_id
    AND l.cancelled_at IS NULL
    AND l.lesson_at BETWEEN p_target_date - INTERVAL '3 days' AND p_target_date + INTERVAL '3 days'
    AND (p_exclude_lesson_id IS NULL OR l.id <> p_exclude_lesson_id)
  ORDER BY l.lesson_at;
END;
$$;
