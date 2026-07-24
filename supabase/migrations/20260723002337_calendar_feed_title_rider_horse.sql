-- #1018 follow-up: replace get_calendar_feed's tier-name lesson title with rider/horse
-- (or "Group") detail, and populate the previously-always-NULL lesson `notes` with a
-- trainer/rider/horse breakdown for the ICS DESCRIPTION field. Same signature as the
-- original (20260723185601_calendar_feed_rpc.sql), so this is a straight CREATE OR REPLACE
-- rather than a drop/recreate.
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
    SELECT jsonb_build_object(
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
          WHERE lr2.lesson_id = l.id
        ) AS rider_names,
        (
          SELECT string_agg(p.first_name || ' ' || left(p.last_name, 1) || '.', ', ' ORDER BY p.first_name, p.last_name)
          FROM lesson_riders lr2
          JOIN barn_memberships bm2 ON bm2.id = lr2.rider_id
          JOIN profiles p ON p.id = bm2.profile_id
          WHERE lr2.lesson_id = l.id
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
