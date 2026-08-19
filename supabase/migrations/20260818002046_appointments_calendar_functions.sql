-- #1640: appointments reach the .ics feed, and both expense writers persist the new flag.
--
-- get_calendar_feed (#1018) unioned lessons and barn_events only -- it shipped before #1148
-- renamed horse_expenses to appointments, so a vet or farrier visit has never reached a
-- subscribed calendar. The third CTE below closes that, gated on shows_on_calendar so the
-- Insurance and Feed bills sharing the table stay off the manager's phone.
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
  ),
  -- #1640. Manager and trainer only, matching appointments' own RLS -- riders get no row here
  -- and no new grant was needed. Note what this CTE does NOT join: appointment_costs. This
  -- function is SECURITY DEFINER and bypasses RLS, and that table is manager-only precisely
  -- because #1148 split the money off the appointment; joining it here would hand a trainer's
  -- feed the amount RLS is withholding from their session.
  appointment_items AS (
    SELECT (a.expense_date + COALESCE(a.expense_time, '00:00:00'::time)) AT TIME ZONE b.timezone AS starts_at,
      jsonb_build_object(
        'itemType', 'appointment',
        'id', a.id,
        -- Same label schedule.ts builds for the in-app calendar, so the two surfaces can't
        -- drift; recipient alone when expense_type is still the 'Unspecified' default, which
        -- would otherwise read as a literal type on the subscriber's phone.
        'title', CASE
          WHEN a.expense_type = 'Unspecified' THEN a.recipient
          ELSE a.expense_type || ' — ' || a.recipient
        END,
        -- An all-day item's startsAt carries the raw "YYYY-MM-DD" digits, NOT an instant:
        -- ics.ts renders DTSTART;VALUE=DATE from them directly, and round-tripping the day
        -- through a real instant would shift it for any subscriber whose zone sits the other
        -- side of UTC midnight. A timed one converts through the barn's zone like everything
        -- else, formatted explicitly rather than left to timestamptz's own text rendering.
        'startsAt', CASE
          WHEN a.expense_time IS NULL THEN to_char(a.expense_date, 'YYYY-MM-DD')
          ELSE to_char(
            ((a.expense_date + a.expense_time) AT TIME ZONE b.timezone) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS"Z"'
          )
        END,
        'allDay', a.expense_time IS NULL,
        -- Zero, matching barn_events and mergeScheduleItems' expense branch: an appointment
        -- records when someone is coming, not for how long.
        'durationMinutes', 0,
        'notes', array_to_string(
          array_remove(
            ARRAY[
              CASE WHEN a.applies_to_all_horses THEN 'All horses' ELSE horse_names.names END,
              a.notes
            ],
            NULL
          ),
          E'\n'
        )
      ) AS item
    FROM appointments a, resolved r
    JOIN barns b ON b.id = r.barn_id,
    LATERAL (
      SELECT string_agg(h.name, ', ' ORDER BY h.name) AS names
      FROM appointment_horses ah
      JOIN horses h ON h.id = ah.horse_id
      WHERE ah.appointment_id = a.id AND ah.barn_id = a.barn_id
    ) horse_names
    WHERE a.barn_id = r.barn_id
      AND a.shows_on_calendar
      AND r.role IN ('manager', 'trainer')
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
          UNION ALL
          SELECT starts_at, item FROM appointment_items
        ) all_items
      ),
      '[]'::jsonb
    ) AS items;
$$;

-- Both writers gain p_shows_on_calendar. Appended after the existing trailing p_occurred_at
-- rather than slotted in beside p_expense_time: the DAL calls these by named parameter, so
-- position is free, and appending keeps the diff to one line each. A new parameter is still a
-- new signature, so DROP and CREATE -- the #829/#935/#1148-era grants are re-applied in the
-- companion ..._appointments_calendar_grants.sql.
DROP FUNCTION IF EXISTS create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz);

CREATE FUNCTION create_expense_with_horses(
  p_barn_id               uuid,
  p_expense_date          date,
  p_recipient             text,
  p_applies_to_all_horses boolean,
  p_expense_time          time    DEFAULT NULL,
  p_amount                numeric DEFAULT NULL,
  p_expense_type          text    DEFAULT 'Unspecified',
  p_notes                 text    DEFAULT NULL,
  p_horse_ids             uuid[]  DEFAULT NULL,
  p_payment_type          payment_type_enum DEFAULT NULL,
  -- #935: lets a caller pass a real local-aware instant instead of the naive
  -- (p_expense_date + p_expense_time)::timestamptz cast below, which is
  -- interpreted in the session's timezone (UTC) rather than the user's own.
  -- Defaults to NULL, in which case that exact naive derivation is used.
  p_occurred_at           timestamptz DEFAULT NULL,
  -- #1640: defaults false, so a caller that never learned about the flag (a script, an older
  -- client) creates an appointment that stays off every calendar rather than one that
  -- silently appears on the whole barn's phones.
  p_shows_on_calendar     boolean DEFAULT false
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appointment appointments;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO appointments (barn_id, expense_date, expense_time, recipient, expense_type, notes, applies_to_all_horses, shows_on_calendar)
  VALUES (p_barn_id, p_expense_date, p_expense_time, p_recipient, p_expense_type, p_notes, p_applies_to_all_horses, p_shows_on_calendar)
  RETURNING * INTO v_appointment;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO appointment_horses (barn_id, appointment_id, horse_id)
    SELECT p_barn_id, v_appointment.id, unnest(p_horse_ids);
  END IF;

  -- p_amount/p_payment_type are no longer columns on the row inserted above -- this call is
  -- now the only thing that persists them, into appointment_costs and the ledger both.
  PERFORM sync_expense_transaction(
    p_barn_id, v_appointment.id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_appointment;
END;
$$;

DROP FUNCTION IF EXISTS update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum, timestamptz);

CREATE FUNCTION update_expense_with_horses(
  p_expense_id            uuid,
  p_barn_id               uuid,
  p_expense_date          date,
  p_recipient             text,
  p_applies_to_all_horses boolean,
  p_expense_time          time    DEFAULT NULL,
  p_amount                numeric DEFAULT NULL,
  p_expense_type          text    DEFAULT 'Unspecified',
  p_notes                 text    DEFAULT NULL,
  p_horse_ids             uuid[]  DEFAULT NULL,
  p_payment_type          payment_type_enum DEFAULT NULL,
  -- #935: see create_expense_with_horses above.
  p_occurred_at           timestamptz DEFAULT NULL,
  -- #1640: see create_expense_with_horses above.
  p_shows_on_calendar     boolean DEFAULT false
)
RETURNS appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_appointment appointments;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE appointments
  SET expense_date          = p_expense_date,
      expense_time          = p_expense_time,
      recipient             = p_recipient,
      expense_type          = p_expense_type,
      notes                 = p_notes,
      applies_to_all_horses = p_applies_to_all_horses,
      shows_on_calendar     = p_shows_on_calendar
  WHERE id = p_expense_id AND barn_id = p_barn_id
  RETURNING * INTO v_appointment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found';
  END IF;

  DELETE FROM appointment_horses WHERE appointment_id = p_expense_id AND barn_id = p_barn_id;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO appointment_horses (barn_id, appointment_id, horse_id)
    SELECT p_barn_id, p_expense_id, unnest(p_horse_ids);
  END IF;

  PERFORM sync_expense_transaction(
    p_barn_id, p_expense_id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_appointment;
END;
$$;
