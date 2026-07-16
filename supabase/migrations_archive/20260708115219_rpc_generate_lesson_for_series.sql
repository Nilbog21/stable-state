CREATE FUNCTION generate_lesson_for_series(
  p_series_id uuid,
  p_barn_id   uuid,
  p_lesson_at timestamptz
)
RETURNS lessons
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_series lesson_series;
  v_lesson lessons;
BEGIN
  SELECT * INTO v_series FROM lesson_series WHERE id = p_series_id AND barn_id = p_barn_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'series not found';
  END IF;

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type, series_id)
  VALUES (p_barn_id, v_series.instructor_id, p_lesson_at, v_series.fee, v_series.lesson_type, v_series.jumping, v_series.tier_name, NULL, p_series_id)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e
  FROM unnest(v_series.horse_ids, v_series.exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id
  FROM unnest(v_series.rider_ids) AS r;

  RETURN v_lesson;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_lesson_for_series(uuid, uuid, timestamptz) TO authenticated;
