-- #776: snapshot instructor_cut onto lessons/lesson_series at creation/update
-- time, mirroring fee/tier_name. The three participant RPCs gain a new
-- p_instructor_cut parameter, which changes their argument-type signature —
-- per this repo's established pattern (see
-- supabase/migrations_archive/20260613000005_rpc_add_jumping.sql), that
-- requires DROP + CREATE, not CREATE OR REPLACE.

-- create_lesson_with_participants: add p_instructor_cut, snapshot onto lessons.
-- p_instructor_cut is accepted for backward API compatibility but ignored —
-- instructor_cut gates the instructor's own payout, so it's re-derived
-- server-side from the tier/barn config rather than trusted from the caller
-- (a client-trusted value here would let a trainer inflate their own cut via
-- a direct RPC call; see the #776 review finding, precedented by the
-- cancel_rider_participation p_is_late fix in
-- fix_cancel_rider_participation_fee_bypass).
DROP FUNCTION create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum);

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

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, p_payment_type, v_instructor_cut)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id FROM unnest(p_rider_ids) AS r;

  RETURN v_lesson;
END;
$$;

GRANT EXECUTE ON FUNCTION create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum, numeric) TO authenticated;

-- create_lesson_series_with_participants: add p_instructor_cut, snapshot onto
-- both the lesson_series template row and the first lessons row.
-- p_instructor_cut is accepted for backward API compatibility but ignored —
-- see the note on create_lesson_with_participants above.
DROP FUNCTION create_lesson_series_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum);

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

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type, series_id, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, p_payment_type, v_series.id, v_instructor_cut)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id FROM unnest(p_rider_ids) AS r;

  RETURN v_lesson;
END;
$$;

GRANT EXECUTE ON FUNCTION create_lesson_series_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum, numeric) TO authenticated;

-- update_lesson_with_participants: add p_instructor_cut, allow re-snapshotting
-- on edit (mirrors fee/tier_name already being editable here).
-- p_instructor_cut is accepted for backward API compatibility but ignored —
-- see the note on create_lesson_with_participants above.
DROP FUNCTION update_lesson_with_participants(uuid, uuid, timestamptz, uuid, numeric, lesson_type, boolean, payment_type_enum, text, uuid[], integer[], uuid[]);

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
      jumping = p_jumping, payment_type = p_payment_type, tier_name = p_tier_name, instructor_cut = v_instructor_cut
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

  RETURN v_lesson;
END;
$$;

GRANT EXECUTE ON FUNCTION update_lesson_with_participants(uuid, uuid, timestamptz, uuid, numeric, lesson_type, boolean, payment_type_enum, text, uuid[], integer[], uuid[], numeric) TO authenticated;

-- generate_lesson_for_series: signature unchanged, reads the series template's
-- own instructor_cut now, mirroring how it already reads fee/tier_name.
CREATE OR REPLACE FUNCTION generate_lesson_for_series(
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

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type, series_id, instructor_cut)
  VALUES (p_barn_id, v_series.instructor_id, p_lesson_at, v_series.fee, v_series.lesson_type, v_series.jumping, v_series.tier_name, NULL, p_series_id, v_series.instructor_cut)
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

  RETURN v_lesson;
END;
$$;

-- set_instructor_cut: signature unchanged, now targets the renamed column.
-- RPC name and TS wrapper name intentionally left as-is (internal-only).
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
