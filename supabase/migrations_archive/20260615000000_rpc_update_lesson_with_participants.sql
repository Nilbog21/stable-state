CREATE FUNCTION update_lesson_with_participants(
  p_lesson_id       uuid,
  p_barn_id         uuid,
  p_lesson_at       timestamptz,
  p_instructor_id   uuid,
  p_fee             numeric,
  p_lesson_type     lesson_type,
  p_jumping         boolean,
  p_payment_type    payment_type_enum,
  p_tier_name       text,
  p_horse_ids       uuid[],
  p_exertion_levels integer[],
  p_rider_ids       uuid[]
)
RETURNS lessons
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_lesson lessons;
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  UPDATE lessons
  SET
    lesson_at     = p_lesson_at,
    instructor_id = p_instructor_id,
    fee           = p_fee,
    lesson_type   = p_lesson_type,
    jumping       = p_jumping,
    payment_type  = p_payment_type,
    tier_name     = p_tier_name
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

GRANT EXECUTE ON FUNCTION update_lesson_with_participants(uuid, uuid, timestamptz, uuid, numeric, lesson_type, boolean, payment_type_enum, text, uuid[], integer[], uuid[]) TO authenticated;
