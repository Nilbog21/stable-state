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
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_lesson_participant_counts(lesson_type, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_lesson_with_participants(p_barn_id uuid, p_instructor_id uuid, p_lesson_at timestamp with time zone, p_fee numeric, p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[], p_lesson_type public.lesson_type, p_jumping boolean DEFAULT false, p_tier_name text DEFAULT 'Custom'::text, p_payment_type public.payment_type_enum DEFAULT NULL::public.payment_type_enum) RETURNS public.lessons
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_lesson      lessons;
  v_rider_count INT := array_length(p_rider_ids, 1);
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  PERFORM assert_lesson_participant_counts(p_lesson_type, array_length(p_horse_ids, 1), v_rider_count);

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, p_payment_type)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e
  FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id
  FROM unnest(p_rider_ids) AS r;

  RETURN v_lesson;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_lesson_series_with_participants(
  p_barn_id         uuid,
  p_instructor_id   uuid,
  p_lesson_at       timestamptz,
  p_fee             numeric,
  p_horse_ids       uuid[],
  p_exertion_levels integer[],
  p_rider_ids       uuid[],
  p_lesson_type     lesson_type,
  p_jumping         boolean           DEFAULT false,
  p_tier_name       text              DEFAULT 'Custom',
  p_payment_type    payment_type_enum DEFAULT NULL
)
RETURNS lessons
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_series      lesson_series;
  v_lesson      lessons;
  v_rider_count INT := array_length(p_rider_ids, 1);
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  PERFORM assert_lesson_participant_counts(p_lesson_type, array_length(p_horse_ids, 1), v_rider_count);

  INSERT INTO lesson_series (barn_id, instructor_id, fee, lesson_type, jumping, tier_name, horse_ids, exertion_levels, rider_ids)
  VALUES (p_barn_id, p_instructor_id, p_fee, p_lesson_type, p_jumping, p_tier_name, p_horse_ids, p_exertion_levels, p_rider_ids)
  RETURNING * INTO v_series;

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type, series_id)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, p_payment_type, v_series.id)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e
  FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id
  FROM unnest(p_rider_ids) AS r;

  RETURN v_lesson;
END;
$$;
