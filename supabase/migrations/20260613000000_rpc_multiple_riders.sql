-- Replace single-rider RPC with multi-rider version.
-- Signature change requires drop + recreate; existing grants are removed automatically.
DROP FUNCTION create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid, lesson_type);

CREATE FUNCTION create_lesson_with_participants(
  p_barn_id         uuid,
  p_instructor_id   uuid,
  p_lesson_at       timestamptz,
  p_fee             numeric,
  p_horse_ids       uuid[],
  p_exertion_levels integer[],
  p_rider_ids       uuid[],
  p_lesson_type     lesson_type
)
RETURNS lessons
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_lesson      lessons;
  v_rider_count INT := array_length(p_rider_ids, 1);
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  IF v_rider_count IS NULL THEN
    RAISE EXCEPTION 'at least one rider is required';
  END IF;

  IF p_lesson_type = 'normal' AND v_rider_count <> 1 THEN
    RAISE EXCEPTION 'Normal lesson must have exactly 1 rider (got %)', v_rider_count;
  END IF;

  IF p_lesson_type = 'normal' AND array_length(p_horse_ids, 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Normal lesson must have exactly 1 horse (got %)', COALESCE(array_length(p_horse_ids, 1), 0);
  END IF;

  IF p_lesson_type = 'group' AND v_rider_count < 2 THEN
    RAISE EXCEPTION 'Group lesson must have at least 2 riders (got %)', v_rider_count;
  END IF;

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e
  FROM unnest(p_horse_ids, p_exertion_levels) AS t(h uuid, e integer);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id
  FROM unnest(p_rider_ids) AS r;

  RETURN v_lesson;
END;
$$;

GRANT EXECUTE ON FUNCTION create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type) TO authenticated;
