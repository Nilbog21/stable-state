-- Consolidated release-3 functions squash, round 2 (#972): final body only for
-- every function/RPC added or changed since branching off `main` post-#657,
-- folding in 6 further fix migrations on top of the first squash (#658):
-- #935 (create_expense_with_horses/update_expense_with_horses gain
-- p_occurred_at), #936 (get_horse_exertion_summary's window realigned to
-- ±3 days), #937 (new get_lesson_horse_exertion_levels), #941 (new
-- delete_expense_with_transactions). No GRANT/REVOKE statements here — those
-- live in the companion release3_rls.sql, matching the baseline's own
-- schema/functions/rls split convention. Three functions
-- (create_lesson_with_participants, update_lesson_with_participants,
-- get_horse_exertion_summary) already existed in the baseline with a different
-- signature/return type, so those are explicitly DROPped first; create_managed_member
-- grows an argument and is dropped+recreated too. Everything else here is new to
-- release-3, so a direct CREATE (OR REPLACE) is sufficient.

-- Helpers (RLS-recursion-breaking SECURITY DEFINER functions, referenced below and by release3_rls.sql)

CREATE FUNCTION public.auth_is_enrolled_rider(p_lesson_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lesson_riders lr
    JOIN public.barn_memberships bm ON bm.id = lr.rider_id
    WHERE lr.lesson_id = p_lesson_id AND lr.barn_id = p_barn_id
      AND bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
  );
$$;

CREATE FUNCTION public.auth_can_read_instructor_membership(p_membership_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.instructor_id = p_membership_id
      AND l.barn_id = p_barn_id
      AND (
        public.auth_is_barn_manager(p_barn_id)
        OR public.auth_is_barn_trainer(p_barn_id)
        OR public.auth_is_enrolled_rider(l.id, l.barn_id)
      )
  );
$$;

CREATE FUNCTION public.get_instructor_membership_names(p_membership_ids uuid[], p_barn_id uuid)
RETURNS TABLE(id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bm.id, p.first_name, p.last_name
  FROM public.barn_memberships bm
  JOIN public.profiles p ON p.id = bm.profile_id
  WHERE bm.id = ANY(p_membership_ids)
    AND bm.barn_id = p_barn_id
    AND (auth.uid() IS NULL OR public.auth_can_read_instructor_membership(bm.id, bm.barn_id));
$$;

CREATE FUNCTION public.auth_is_active_barn_member(p_barn_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid() AND barn_id = p_barn_id AND status = 'active'
  );
$$;

CREATE FUNCTION public.get_active_barn_member_summaries(p_barn_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  profile_id uuid,
  role text,
  can_instruct boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_active_barn_member(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT bm.id, bm.user_id, bm.profile_id, bm.role, bm.can_instruct, bm.created_at
  FROM barn_memberships bm
  WHERE bm.barn_id = p_barn_id
    AND bm.status = 'active'
  ORDER BY bm.created_at ASC;
END;
$$;

CREATE FUNCTION public.auth_can_read_barn_member_profile(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM barn_memberships actor
    JOIN barn_memberships target ON target.barn_id = actor.barn_id
    WHERE actor.user_id = auth.uid()
      AND actor.status = 'active'
      AND actor.role = ANY (ARRAY['manager', 'trainer', 'rider'])
      AND target.profile_id = p_profile_id
  );
$$;

-- Managed members

DROP FUNCTION public.create_managed_member(uuid, text, text);

CREATE FUNCTION create_managed_member(
  p_barn_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_role TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id UUID;
  v_membership_id UUID;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO profiles (first_name, last_name, is_managed)
    VALUES (p_first_name, p_last_name, true)
    RETURNING id INTO v_profile_id;

  INSERT INTO barn_memberships (barn_id, profile_id, role, status, invite_token, can_instruct)
    VALUES (p_barn_id, v_profile_id, p_role, 'active', gen_random_uuid(), p_role = 'trainer')
    RETURNING id INTO v_membership_id;

  RETURN v_membership_id;
END;
$$;

-- claim_managed_member: same 3-arg signature as baseline, body replaced (multi-barn
-- merge + advisory-lock race fix + already_member_of_barn exception).
CREATE OR REPLACE FUNCTION public.claim_managed_member(p_token uuid, p_user_id uuid, p_email text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_profile_id UUID;
  v_membership_id UUID;
  v_barn_id UUID;
  v_existing_profile_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT id, profile_id, barn_id
    INTO v_membership_id, v_profile_id, v_barn_id
  FROM barn_memberships
  WHERE invite_token = p_token;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'token_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_profile_id AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'user_already_claimed';
  END IF;

  SELECT id INTO v_existing_profile_id FROM profiles WHERE user_id = p_user_id;

  IF v_existing_profile_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM barn_memberships
      WHERE user_id = p_user_id AND barn_id = v_barn_id
    ) THEN
      RAISE EXCEPTION 'already_member_of_barn';
    END IF;

    UPDATE barn_memberships
      SET user_id = p_user_id, invite_token = NULL, profile_id = v_existing_profile_id
    WHERE id = v_membership_id;

    DELETE FROM profiles WHERE id = v_profile_id;
  ELSE
    UPDATE profiles
      SET user_id = p_user_id, email = p_email, is_managed = false
    WHERE id = v_profile_id;

    UPDATE barn_memberships
      SET user_id = p_user_id, invite_token = NULL
    WHERE id = v_membership_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_can_instruct(p_membership_id uuid, p_barn_id uuid, p_value boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_target_role TEXT;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT role INTO v_target_role
  FROM public.barn_memberships
  WHERE id = p_membership_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found';
  END IF;

  IF v_target_role NOT IN ('manager', 'trainer') THEN
    RAISE EXCEPTION 'invalid_target_role';
  END IF;

  UPDATE public.barn_memberships
  SET can_instruct = p_value
  WHERE id = p_membership_id AND barn_id = p_barn_id;
END;
$$;

-- Horses

CREATE FUNCTION update_horse_details(
  p_horse_id uuid,
  p_barn_id uuid,
  p_name text,
  p_is_active boolean,
  p_is_available boolean,
  p_unavailability_reason text,
  p_exhaustion_threshold_moderate int DEFAULT NULL,
  p_exhaustion_threshold_high int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE horses
  SET name = COALESCE(p_name, name),
      is_active = p_is_active,
      is_available = p_is_available,
      unavailability_reason = p_unavailability_reason,
      deactivated_at = CASE
        WHEN horses.is_active = p_is_active THEN horses.deactivated_at
        WHEN p_is_active THEN NULL
        ELSE now()
      END,
      exhaustion_threshold_moderate = p_exhaustion_threshold_moderate,
      exhaustion_threshold_high = p_exhaustion_threshold_high
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;

DROP FUNCTION public.get_horse_exertion_summary(uuid, timestamptz);

-- #936: window realigned to the exact ±3-day BETWEEN clause
-- get_horse_projected_exhaustion already uses (previously an unbounded
-- forward `lesson_at >= p_since`), so the horses page's Available-section
-- sort order can't drift from what its ExhaustionBar displays.
CREATE FUNCTION get_horse_exertion_summary(p_barn_id uuid, p_target_date timestamptz)
RETURNS TABLE (
  id                            uuid,
  name                          text,
  is_active                     boolean,
  is_available                  boolean,
  unavailability_reason         text,
  exhaustion_threshold_high     int,
  exhaustion_threshold_moderate int,
  lesson_count                  bigint,
  total_exertion                bigint,
  jumping_count                 bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    h.id,
    h.name,
    h.is_active,
    h.is_available,
    h.unavailability_reason,
    h.exhaustion_threshold_high,
    h.exhaustion_threshold_moderate,
    COALESCE(agg.lesson_count, 0)    AS lesson_count,
    COALESCE(agg.total_exertion, 0)  AS total_exertion,
    COALESCE(agg.jumping_count, 0)   AS jumping_count
  FROM horses h
  LEFT JOIN (
    SELECT
      lh.horse_id,
      COUNT(lh.lesson_id)::bigint                   AS lesson_count,
      SUM(lh.exertion_level)::bigint                AS total_exertion,
      COUNT(CASE WHEN l.jumping THEN 1 END)::bigint AS jumping_count
    FROM lesson_horses lh
    JOIN lessons l ON l.id = lh.lesson_id
                   AND l.barn_id = p_barn_id
                   AND l.lesson_at BETWEEN p_target_date - INTERVAL '3 days' AND p_target_date + INTERVAL '3 days'
                   AND l.cancelled_at IS NULL
    WHERE lh.barn_id = p_barn_id
    GROUP BY lh.horse_id
  ) agg ON agg.horse_id = h.id
  WHERE h.barn_id = p_barn_id
  ORDER BY h.name;
END;
$$;

CREATE FUNCTION get_horse_projected_exhaustion(
  p_horse_id UUID,
  p_barn_id UUID,
  p_target_date TIMESTAMPTZ,
  p_exclude_lesson_id UUID DEFAULT NULL
)
RETURNS TABLE (lesson_at TIMESTAMPTZ, exertion_level SMALLINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id)) THEN
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
    AND (p_exclude_lesson_id IS NULL OR l.id <> p_exclude_lesson_id);
END;
$$;

-- Lessons / lesson series (participant-count assertion + create/update/generate,
-- each snapshotting instructor_cut server-side)

CREATE FUNCTION public.assert_lesson_participant_counts(p_lesson_type lesson_type, p_horse_count integer, p_rider_count integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_rider_count IS NULL THEN
    RAISE EXCEPTION 'at least one rider is required';
  END IF;

  IF p_lesson_type = 'normal' AND p_rider_count <> 1 THEN
    RAISE EXCEPTION 'Normal lesson must have exactly 1 rider (got %)', p_rider_count;
  END IF;

  IF p_lesson_type = 'normal' AND p_horse_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Normal lesson must have exactly 1 horse (got %)', COALESCE(p_horse_count, 0);
  END IF;

  IF p_lesson_type = 'group' AND p_rider_count < 2 THEN
    RAISE EXCEPTION 'Group lesson must have at least 2 riders (got %)', p_rider_count;
  END IF;

  -- Group lessons additionally require >= 1 horse; that's enforced only by the
  -- deferred enforce_lesson_participant_counts trigger, not here (matches prior
  -- inline-checks behavior, left unchanged per issue #705's acceptance criteria).
END;
$$;

DROP FUNCTION public.create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum);

CREATE FUNCTION create_lesson_with_participants(
  p_barn_id uuid, p_instructor_id uuid, p_lesson_at timestamptz, p_fee numeric,
  p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[], p_lesson_type lesson_type,
  p_jumping boolean DEFAULT false, p_tier_name text DEFAULT 'Custom',
  p_payment_type payment_type_enum DEFAULT NULL, p_instructor_cut numeric DEFAULT 0
) RETURNS lessons
LANGUAGE plpgsql
AS $$
DECLARE
  v_lesson         lessons;
  v_rider_count    INT := array_length(p_rider_ids, 1);
  v_instructor_cut numeric;
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  PERFORM assert_lesson_participant_counts(p_lesson_type, array_length(p_horse_ids, 1), v_rider_count);

  v_instructor_cut := COALESCE(
    (SELECT instructor_cut FROM lesson_tiers WHERE barn_id = p_barn_id AND name = p_tier_name LIMIT 1),
    (SELECT default_instructor_cut FROM barns WHERE id = p_barn_id)
  );

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, v_instructor_cut)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id FROM unnest(p_rider_ids) AS r;

  PERFORM sync_lesson_transactions(p_barn_id, v_lesson.id, p_fee, v_instructor_cut, p_instructor_id, p_payment_type, p_lesson_at);

  RETURN v_lesson;
END;
$$;

CREATE FUNCTION create_lesson_series_with_participants(
  p_barn_id uuid, p_instructor_id uuid, p_lesson_at timestamptz, p_fee numeric,
  p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[], p_lesson_type lesson_type,
  p_jumping boolean DEFAULT false, p_tier_name text DEFAULT 'Custom', p_payment_type payment_type_enum DEFAULT NULL,
  p_instructor_cut numeric DEFAULT 0
) RETURNS lessons
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_series         lesson_series;
  v_lesson         lessons;
  v_rider_count    INT := array_length(p_rider_ids, 1);
  v_instructor_cut numeric;
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  PERFORM assert_lesson_participant_counts(p_lesson_type, array_length(p_horse_ids, 1), v_rider_count);

  v_instructor_cut := COALESCE(
    (SELECT instructor_cut FROM lesson_tiers WHERE barn_id = p_barn_id AND name = p_tier_name LIMIT 1),
    (SELECT default_instructor_cut FROM barns WHERE id = p_barn_id)
  );

  INSERT INTO lesson_series (barn_id, instructor_id, fee, lesson_type, jumping, tier_name, horse_ids, exertion_levels, rider_ids, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_fee, p_lesson_type, p_jumping, p_tier_name, p_horse_ids, p_exertion_levels, p_rider_ids, v_instructor_cut)
  RETURNING * INTO v_series;

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, series_id, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, v_series.id, v_instructor_cut)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id FROM unnest(p_rider_ids) AS r;

  PERFORM sync_lesson_transactions(p_barn_id, v_lesson.id, p_fee, v_instructor_cut, p_instructor_id, p_payment_type, p_lesson_at);

  RETURN v_lesson;
END;
$$;

DROP FUNCTION public.update_lesson_with_participants(uuid, uuid, timestamptz, uuid, numeric, lesson_type, boolean, payment_type_enum, text, uuid[], integer[], uuid[]);

CREATE FUNCTION update_lesson_with_participants(
  p_lesson_id uuid, p_barn_id uuid, p_lesson_at timestamptz, p_instructor_id uuid, p_fee numeric,
  p_lesson_type lesson_type, p_jumping boolean, p_payment_type payment_type_enum,
  p_tier_name text, p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[],
  p_instructor_cut numeric DEFAULT 0
) RETURNS lessons
LANGUAGE plpgsql
AS $$
DECLARE
  v_lesson         lessons;
  v_instructor_cut numeric;
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  v_instructor_cut := COALESCE(
    (SELECT instructor_cut FROM lesson_tiers WHERE barn_id = p_barn_id AND name = p_tier_name LIMIT 1),
    (SELECT default_instructor_cut FROM barns WHERE id = p_barn_id)
  );

  UPDATE lessons
  SET lesson_at = p_lesson_at, instructor_id = p_instructor_id, fee = p_fee, lesson_type = p_lesson_type,
      jumping = p_jumping, tier_name = p_tier_name, instructor_cut = v_instructor_cut
  WHERE id = p_lesson_id AND barn_id = p_barn_id
  RETURNING * INTO v_lesson;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson not found';
  END IF;

  DELETE FROM lesson_horses WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id;
  INSERT INTO lesson_horses (barn_id, lesson_id, horse_id, exertion_level)
  SELECT p_barn_id, p_lesson_id, unnest(p_horse_ids), unnest(p_exertion_levels);

  DELETE FROM lesson_riders WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id;
  INSERT INTO lesson_riders (barn_id, lesson_id, rider_id)
  SELECT p_barn_id, p_lesson_id, unnest(p_rider_ids);

  PERFORM sync_lesson_transactions(p_barn_id, p_lesson_id, p_fee, v_instructor_cut, p_instructor_id, p_payment_type, p_lesson_at);

  RETURN v_lesson;
END;
$$;

CREATE FUNCTION generate_lesson_for_series(
  p_series_id uuid, p_barn_id uuid, p_lesson_at timestamptz
) RETURNS lessons
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_series lesson_series;
  v_lesson lessons;
BEGIN
  SELECT * INTO v_series FROM lesson_series WHERE id = p_series_id AND barn_id = p_barn_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'series not found';
  END IF;

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, series_id, instructor_cut)
  VALUES (p_barn_id, v_series.instructor_id, p_lesson_at, v_series.fee, v_series.lesson_type, v_series.jumping, v_series.tier_name, p_series_id, v_series.instructor_cut)
  ON CONFLICT (series_id, lesson_at) DO NOTHING
  RETURNING * INTO v_lesson;

  IF v_lesson.id IS NULL THEN
    SELECT * INTO v_lesson FROM lessons WHERE series_id = p_series_id AND lesson_at = p_lesson_at;
    RETURN v_lesson;
  END IF;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e FROM unnest(v_series.horse_ids, v_series.exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id FROM unnest(v_series.rider_ids) AS r;

  PERFORM sync_lesson_transactions(p_barn_id, v_lesson.id, v_series.fee, v_series.instructor_cut, v_series.instructor_id, NULL, p_lesson_at);

  RETURN v_lesson;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_instructor_cut(p_barn_id uuid, p_value numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.barns
  SET default_instructor_cut = p_value
  WHERE id = p_barn_id;
END;
$$;

-- Notifications

CREATE FUNCTION create_or_update_notification(
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

-- Agreements / agreement charges

CREATE FUNCTION create_agreement_with_first_charge(
  p_barn_id    uuid,
  p_rider_id   uuid,
  p_horse_id   uuid,
  p_fee        numeric,
  p_kind       agreement_kind,
  p_cadence    agreement_cadence,
  p_start_date date DEFAULT current_date
)
RETURNS agreements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agreement agreements;
  v_period    date;
  v_charge_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO agreements (barn_id, rider_id, horse_id, fee, kind, cadence, start_date)
  VALUES (p_barn_id, p_rider_id, p_horse_id, p_fee, p_kind, p_cadence, p_start_date)
  RETURNING * INTO v_agreement;

  v_period := date_trunc('month', CASE WHEN v_agreement.cadence = 'monthly'
                                        THEN current_date
                                        ELSE v_agreement.start_date END)::date;

  INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
  VALUES (p_barn_id, v_agreement.id, v_period, p_fee)
  RETURNING id INTO v_charge_id;

  INSERT INTO transactions (barn_id, kind, amount, collected, membership_id, horse_id, occurred_at, agreement_charge_id)
  VALUES (
    p_barn_id,
    (CASE WHEN p_kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END)::transaction_kind,
    p_fee,
    false,
    p_rider_id,
    p_horse_id,
    v_period::timestamptz,
    v_charge_id
  );

  RETURN v_agreement;
END;
$$;

CREATE FUNCTION generate_agreement_charge(
  p_agreement_id uuid,
  p_barn_id      uuid,
  p_period       date
)
RETURNS agreement_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_period  date := date_trunc('month', p_period)::date;
  v_charge  agreement_charges;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM agreements WHERE id = p_agreement_id AND barn_id = p_barn_id) THEN
    RAISE EXCEPTION 'agreement not found';
  END IF;

  WITH new_charge AS (
    INSERT INTO agreement_charges (barn_id, agreement_id, period, fee)
    SELECT barn_id, id, v_period, fee
    FROM agreements
    WHERE id = p_agreement_id AND barn_id = p_barn_id
    ON CONFLICT (agreement_id, period) DO NOTHING
    RETURNING id, barn_id, agreement_id, fee
  )
  INSERT INTO transactions (barn_id, kind, amount, collected, membership_id, horse_id, occurred_at, agreement_charge_id)
  SELECT new_charge.barn_id,
         (CASE WHEN a.kind = 'lease' THEN 'lease_charge' ELSE 'board_charge' END)::transaction_kind,
         new_charge.fee,
         false,
         a.rider_id,
         a.horse_id,
         v_period::timestamptz,
         new_charge.id
  FROM new_charge
  JOIN agreements a ON a.id = new_charge.agreement_id AND a.barn_id = new_charge.barn_id;

  SELECT * INTO v_charge
  FROM agreement_charges
  WHERE agreement_id = p_agreement_id AND barn_id = p_barn_id AND period = v_period;

  RETURN v_charge;
END;
$$;

CREATE FUNCTION mark_agreement_charge_paid(
  p_charge_id    uuid,
  p_barn_id      uuid,
  p_payment_type payment_type_enum
)
RETURNS agreement_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_charge agreement_charges;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_charge FROM agreement_charges WHERE id = p_charge_id AND barn_id = p_barn_id;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'charge not found';
  END IF;

  UPDATE transactions
  SET collected = (p_payment_type IS NOT NULL), payment_type = p_payment_type
  WHERE agreement_charge_id = p_charge_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'charge_transaction_not_found';
  END IF;

  RETURN v_charge;
END;
$$;

CREATE FUNCTION update_agreement_charge_fee(
  p_charge_id uuid,
  p_barn_id   uuid,
  p_fee       numeric
)
RETURNS agreement_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_charge agreement_charges;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE agreement_charges
  SET fee = p_fee
  WHERE id = p_charge_id AND barn_id = p_barn_id
  RETURNING * INTO v_charge;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'charge not found';
  END IF;

  UPDATE transactions
  SET amount = p_fee
  WHERE agreement_charge_id = p_charge_id AND barn_id = p_barn_id;

  RETURN v_charge;
END;
$$;

-- Expenses

CREATE FUNCTION public.sync_expense_transaction(
  p_barn_id uuid, p_expense_id uuid, p_amount numeric, p_occurred_at timestamptz,
  p_payment_type payment_type_enum DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_amount IS NOT NULL THEN
    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, occurred_at, expense_id)
    VALUES (p_barn_id, 'expense', -p_amount, (p_payment_type IS NOT NULL), p_payment_type, p_occurred_at, p_expense_id)
    ON CONFLICT (expense_id) WHERE kind = 'expense'
    DO UPDATE SET amount = EXCLUDED.amount, collected = EXCLUDED.collected, payment_type = EXCLUDED.payment_type, occurred_at = EXCLUDED.occurred_at;
  ELSE
    DELETE FROM transactions WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense';
  END IF;
END;
$$;

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
  p_occurred_at           timestamptz DEFAULT NULL
)
RETURNS horse_expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expense horse_expenses;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO horse_expenses (barn_id, expense_date, expense_time, amount, recipient, expense_type, notes, applies_to_all_horses, payment_type)
  VALUES (p_barn_id, p_expense_date, p_expense_time, p_amount, p_recipient, p_expense_type, p_notes, p_applies_to_all_horses, p_payment_type)
  RETURNING * INTO v_expense;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO expense_horses (barn_id, expense_id, horse_id)
    SELECT p_barn_id, v_expense.id, unnest(p_horse_ids);
  END IF;

  PERFORM sync_expense_transaction(
    p_barn_id, v_expense.id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_expense;
END;
$$;

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
  p_occurred_at           timestamptz DEFAULT NULL
)
RETURNS horse_expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expense horse_expenses;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE horse_expenses
  SET expense_date          = p_expense_date,
      expense_time          = p_expense_time,
      amount                = p_amount,
      recipient             = p_recipient,
      expense_type          = p_expense_type,
      notes                 = p_notes,
      applies_to_all_horses = p_applies_to_all_horses,
      payment_type          = p_payment_type
  WHERE id = p_expense_id AND barn_id = p_barn_id
  RETURNING * INTO v_expense;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense not found';
  END IF;

  DELETE FROM expense_horses WHERE expense_id = p_expense_id AND barn_id = p_barn_id;

  IF NOT p_applies_to_all_horses THEN
    INSERT INTO expense_horses (barn_id, expense_id, horse_id)
    SELECT p_barn_id, p_expense_id, unnest(p_horse_ids);
  END IF;

  PERFORM sync_expense_transaction(
    p_barn_id, p_expense_id, p_amount,
    COALESCE(p_occurred_at, (p_expense_date + COALESCE(p_expense_time, '00:00:00'::time))::timestamptz),
    p_payment_type
  );

  RETURN v_expense;
END;
$$;

-- #941: mirrors delete_lesson_with_transactions for the single 'expense'
-- transaction kind (expenses have no instructor_payout-equivalent second
-- row). An uncollected expense transaction row is always deleted outright
-- first (closes the gap where ON DELETE SET NULL would otherwise leave a
-- permanently-uncollected, untraceable orphan). A collected row is only
-- deleted when p_delete_collected is true; the default keeps it, relying on
-- the table's own ON DELETE SET NULL (expense_id) FK once the horse_expenses
-- row is deleted below (expense_horses cascades via its own ON DELETE CASCADE).
CREATE FUNCTION public.delete_expense_with_transactions(
  p_expense_id uuid, p_barn_id uuid, p_delete_collected boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM transactions
  WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense' AND collected = false;

  IF p_delete_collected THEN
    DELETE FROM transactions
    WHERE expense_id = p_expense_id AND barn_id = p_barn_id AND kind = 'expense';
  END IF;

  DELETE FROM horse_expenses WHERE id = p_expense_id AND barn_id = p_barn_id;
END;
$$;

-- Transactions ledger: lesson-side sync, payment collection, deletion

CREATE FUNCTION public.sync_lesson_transactions(
  p_barn_id uuid, p_lesson_id uuid, p_fee numeric, p_instructor_cut numeric,
  p_instructor_id uuid, p_payment_type payment_type_enum, p_occurred_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_collected boolean := (p_fee = 0) OR (p_payment_type IS NOT NULL);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_active_barn_member(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, occurred_at, lesson_id)
  VALUES (p_barn_id, 'lesson_fee', p_fee, v_collected, p_payment_type, p_occurred_at, p_lesson_id)
  ON CONFLICT (lesson_id) WHERE kind = 'lesson_fee'
  DO UPDATE SET amount = EXCLUDED.amount, collected = EXCLUDED.collected,
    payment_type = EXCLUDED.payment_type, occurred_at = EXCLUDED.occurred_at;

  INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, membership_id, occurred_at, lesson_id)
  VALUES (p_barn_id, 'instructor_payout', -p_instructor_cut, v_collected, p_payment_type, p_instructor_id, p_occurred_at, p_lesson_id)
  ON CONFLICT (lesson_id) WHERE kind = 'instructor_payout'
  DO UPDATE SET amount = EXCLUDED.amount, collected = EXCLUDED.collected, payment_type = EXCLUDED.payment_type,
    membership_id = EXCLUDED.membership_id, occurred_at = EXCLUDED.occurred_at;
END;
$$;

CREATE FUNCTION public.collect_lesson_payment(
  p_lesson_id uuid, p_barn_id uuid, p_payment_type payment_type_enum
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lesson lessons;
  v_is_instructor boolean;
BEGIN
  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = v_lesson.instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_instructor;

  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR (auth_is_barn_trainer(p_barn_id) AND v_is_instructor)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  PERFORM sync_lesson_transactions(
    p_barn_id, p_lesson_id, v_lesson.fee, v_lesson.instructor_cut,
    v_lesson.instructor_id, p_payment_type, v_lesson.lesson_at
  );
END;
$$;

CREATE FUNCTION public.delete_lesson_with_transactions(
  p_lesson_id uuid, p_barn_id uuid, p_delete_collected boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM transactions
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind IN ('lesson_fee', 'instructor_payout') AND collected = false;

  IF p_delete_collected THEN
    DELETE FROM transactions
    WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind IN ('lesson_fee', 'instructor_payout');
  END IF;

  DELETE FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id;
END;
$$;

CREATE FUNCTION public.get_lesson_payment_info(p_lesson_ids uuid[], p_barn_id uuid)
RETURNS TABLE(lesson_id uuid, payment_type payment_type_enum)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.lesson_id, t.payment_type
  FROM public.transactions t
  WHERE t.kind = 'lesson_fee'
    AND t.barn_id = p_barn_id
    AND t.lesson_id = ANY(p_lesson_ids)
    AND (
      auth.uid() IS NULL
      OR public.auth_is_barn_manager(p_barn_id)
      OR public.auth_is_barn_trainer(p_barn_id)
      OR public.auth_is_enrolled_rider(t.lesson_id, p_barn_id)
    );
$$;

-- #937 review follow-up: lesson_horses has a table-wide GRANT SELECT to
-- authenticated and its rider RLS policy is row-level only (checks
-- enrollment, not columns) — Postgres RLS can't restrict columns, so a
-- rider's own session could read exertion_level directly via PostgREST even
-- though the app never selects it for that role. The table-wide SELECT grant
-- is narrowed to every column except exertion_level (see release3_rls.sql),
-- making this the only way to read that column at all.
CREATE FUNCTION get_lesson_horse_exertion_levels(p_lesson_id uuid, p_barn_id uuid)
RETURNS TABLE (horse_id uuid, exertion_level smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT lh.horse_id, lh.exertion_level
  FROM lesson_horses lh
  WHERE lh.lesson_id = p_lesson_id AND lh.barn_id = p_barn_id;
END;
$$;

-- Transactions ledger: rider/whole-lesson cancellation fees

CREATE FUNCTION public.sync_rider_cancellation_fee(
  p_barn_id uuid, p_lesson_id uuid, p_lesson_type lesson_type, p_is_late boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fee_txn transactions;
  v_lesson_rider_id uuid;
  v_instructor_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT instructor_id INTO v_instructor_id FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id;

    IF NOT (
      auth_is_barn_manager(p_barn_id)
      OR (auth_is_barn_trainer(p_barn_id) AND EXISTS (
        SELECT 1 FROM barn_memberships
        WHERE id = v_instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
      ))
      OR EXISTS (
        SELECT 1 FROM lesson_riders lr
        JOIN barn_memberships bm ON bm.id = lr.rider_id AND bm.barn_id = p_barn_id
        WHERE lr.lesson_id = p_lesson_id AND lr.barn_id = p_barn_id AND bm.user_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  IF p_lesson_type <> 'normal' THEN
    RETURN;
  END IF;

  DELETE FROM transactions
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind = 'lesson_fee' AND collected = false
  RETURNING * INTO v_fee_txn;

  IF NOT FOUND THEN
    IF NOT p_is_late THEN
      UPDATE transactions
      SET amount = 0, payment_type = NULL, collected = true
      WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind = 'lesson_fee';
    END IF;
    RETURN;
  END IF;

  IF p_is_late THEN
    -- A normal lesson always has exactly 1 rider (assert_lesson_participant_counts).
    SELECT id INTO v_lesson_rider_id FROM lesson_riders WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id LIMIT 1;

    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, lesson_rider_id, occurred_at)
    VALUES (p_barn_id, 'rider_cancellation_fee', v_fee_txn.amount, false, NULL, v_lesson_rider_id, v_fee_txn.occurred_at);
  END IF;
END;
$$;

CREATE FUNCTION cancel_rider_participation(
  p_lesson_id UUID,
  p_barn_id UUID,
  p_rider_id UUID,
  p_notes TEXT,
  p_is_late BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_instructor_id UUID;
  v_lesson_cancelled_at TIMESTAMPTZ;
  v_lesson_at TIMESTAMPTZ;
  v_lesson_type lesson_type;
  v_is_self BOOLEAN;
  v_is_instructor BOOLEAN;
  v_effective_is_late BOOLEAN;
  v_updated INT;
  v_remaining_active INT;
  v_cascaded BOOLEAN := false;
BEGIN
  SELECT instructor_id, cancelled_at, lesson_at, lesson_type
  INTO v_instructor_id, v_lesson_cancelled_at, v_lesson_at, v_lesson_type
  FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_not_found';
  END IF;

  IF v_lesson_cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'lesson_already_cancelled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = p_rider_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_self;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = v_instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_instructor;

  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR (auth_is_barn_trainer(p_barn_id) AND v_is_instructor)
    OR v_is_self
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_effective_is_late := CASE WHEN v_is_self THEN (v_lesson_at - now() <= INTERVAL '24 hours') ELSE p_is_late END;

  UPDATE lesson_riders
  SET cancelled_at = now(), cancellation_notes = p_notes
  WHERE lesson_id = p_lesson_id AND rider_id = p_rider_id AND barn_id = p_barn_id
    AND cancelled_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'rider_not_found_or_already_cancelled';
  END IF;

  IF NOT v_effective_is_late THEN
    UPDATE lessons SET fee = 0 WHERE id = p_lesson_id AND barn_id = p_barn_id;
  END IF;

  PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson_type, v_effective_is_late);

  SELECT count(*) INTO v_remaining_active
  FROM lesson_riders
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND cancelled_at IS NULL;

  IF v_remaining_active = 0 THEN
    UPDATE lessons SET cancelled_at = now() WHERE id = p_lesson_id AND barn_id = p_barn_id;
    v_cascaded := true;
  END IF;

  RETURN v_cascaded;
END;
$$;

CREATE FUNCTION public.cancel_lesson_with_transactions(
  p_lesson_id uuid, p_barn_id uuid, p_notes text, p_is_late boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lesson lessons;
  v_is_instructor boolean;
BEGIN
  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = v_lesson.instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_instructor;

  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR (auth_is_barn_trainer(p_barn_id) AND v_is_instructor)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE lessons
  SET cancelled_at = now(),
      cancellation_notes = p_notes,
      fee = CASE WHEN p_is_late THEN fee ELSE 0 END
  WHERE id = p_lesson_id AND barn_id = p_barn_id;

  UPDATE lesson_riders
  SET cancelled_at = now(),
      cancellation_notes = p_notes
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND cancelled_at IS NULL;

  PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson.lesson_type, p_is_late);
END;
$$;

-- Outstanding (transactions relay for Outstanding reads, gated per-row since
-- transactions SELECT itself is manager-only RLS)

CREATE FUNCTION public.get_outstanding_transactions(
  p_barn_id uuid,
  p_lesson_ids uuid[] DEFAULT '{}',
  p_charge_ids uuid[] DEFAULT '{}',
  p_lesson_rider_ids uuid[] DEFAULT '{}'
) RETURNS TABLE(kind transaction_kind, entity_id uuid, amount numeric, collected boolean, payment_type payment_type_enum)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- lesson_fee: manager (barn-wide), trainer (barn-wide, matches lessons_select_staff),
  -- or the enrolled rider — same visibility as get_lesson_payment_info.
  SELECT t.kind, t.lesson_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind = 'lesson_fee'
    AND t.barn_id = p_barn_id
    AND t.lesson_id = ANY(p_lesson_ids)
    AND (
      auth.uid() IS NULL
      OR public.auth_is_barn_manager(p_barn_id)
      OR public.auth_is_barn_trainer(p_barn_id)
      OR public.auth_is_enrolled_rider(t.lesson_id, p_barn_id)
    )

  UNION ALL

  -- lease_charge/board_charge: manager, or the rider party to the parent agreement
  -- (matches agreement_charges'/agreements' own RLS — trainers are never a party).
  SELECT t.kind, t.agreement_charge_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind IN ('lease_charge', 'board_charge')
    AND t.barn_id = p_barn_id
    AND t.agreement_charge_id = ANY(p_charge_ids)
    AND (
      auth.uid() IS NULL
      OR public.auth_is_barn_manager(p_barn_id)
      OR EXISTS (
        SELECT 1 FROM public.agreement_charges ac
        JOIN public.agreements a ON a.id = ac.agreement_id AND a.barn_id = ac.barn_id
        JOIN public.barn_memberships bm ON bm.id = a.rider_id AND bm.barn_id = p_barn_id
        WHERE ac.id = t.agreement_charge_id AND ac.barn_id = p_barn_id
          AND bm.user_id = auth.uid() AND bm.status = 'active'
      )
    )

  UNION ALL

  -- rider_cancellation_fee: manager, the instructing trainer, or the cancelled rider
  -- themself — mirrors cancel_rider_participation's own manager/instructor/self shape.
  SELECT t.kind, t.lesson_rider_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind = 'rider_cancellation_fee'
    AND t.barn_id = p_barn_id
    AND t.lesson_rider_id = ANY(p_lesson_rider_ids)
    AND (
      auth.uid() IS NULL
      OR public.auth_is_barn_manager(p_barn_id)
      OR EXISTS (
        SELECT 1 FROM public.lesson_riders lr
        JOIN public.lessons l ON l.id = lr.lesson_id AND l.barn_id = lr.barn_id
        JOIN public.barn_memberships bm ON bm.barn_id = p_barn_id
          AND bm.user_id = auth.uid() AND bm.status = 'active'
          AND (bm.id = lr.rider_id OR (bm.id = l.instructor_id AND public.auth_is_barn_trainer(p_barn_id)))
        WHERE lr.id = t.lesson_rider_id AND lr.barn_id = p_barn_id
      )
    )
$$;

CREATE FUNCTION public.collect_rider_cancellation_fee(
  p_lesson_rider_id uuid, p_barn_id uuid, p_payment_type payment_type_enum
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE transactions
  SET collected = (p_payment_type IS NOT NULL), payment_type = p_payment_type
  WHERE lesson_rider_id = p_lesson_rider_id AND barn_id = p_barn_id AND kind = 'rider_cancellation_fee';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation_fee_not_found';
  END IF;
END;
$$;
