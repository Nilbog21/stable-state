-- Fix group lesson horse-count enforcement: require >= 1 horse for group lessons.
-- Also replaces create_lesson_with_participants to accept p_lesson_type.

CREATE OR REPLACE FUNCTION enforce_lesson_participant_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_lesson_id   UUID;
  v_lesson_type lesson_type;
  v_rider_count INT;
  v_horse_count INT;
BEGIN
  v_lesson_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END;

  SELECT l.lesson_type INTO v_lesson_type FROM lessons l WHERE l.id = v_lesson_id;

  -- lesson was cascade-deleted in this transaction; nothing to enforce
  IF v_lesson_type IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_rider_count FROM lesson_riders WHERE lesson_id = v_lesson_id;
  SELECT COUNT(*) INTO v_horse_count FROM lesson_horses WHERE lesson_id = v_lesson_id;

  IF v_lesson_type = 'normal' THEN
    IF v_rider_count <> 1 THEN
      RAISE EXCEPTION 'Normal lesson must have exactly 1 rider (found %)', v_rider_count;
    END IF;
    IF v_horse_count <> 1 THEN
      RAISE EXCEPTION 'Normal lesson must have exactly 1 horse (found %)', v_horse_count;
    END IF;
  ELSIF v_lesson_type = 'group' THEN
    IF v_rider_count < 2 THEN
      RAISE EXCEPTION 'Group lesson must have at least 2 riders (found %)', v_rider_count;
    END IF;
    IF v_horse_count < 1 THEN
      RAISE EXCEPTION 'Group lesson must have at least 1 horse (found %)', v_horse_count;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Drop old RPC (signature change requires drop + recreate; grants are removed automatically)
DROP FUNCTION create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid);

CREATE FUNCTION create_lesson_with_participants(
  p_barn_id         uuid,
  p_instructor_id   uuid,
  p_lesson_at       timestamptz,
  p_fee             numeric,
  p_horse_ids       uuid[],
  p_exertion_levels integer[],
  p_rider_id        uuid,
  p_lesson_type     lesson_type
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

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e
  FROM unnest(p_horse_ids, p_exertion_levels) AS t(h uuid, e integer);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  VALUES (v_lesson.id, p_rider_id, p_barn_id);

  RETURN v_lesson;
END;
$$;

GRANT EXECUTE ON FUNCTION create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid, lesson_type) TO authenticated;
