-- Enum type for lesson classification
CREATE TYPE lesson_type AS ENUM ('normal', 'group');

-- Add column; DEFAULT 'normal' backfills all existing rows atomically
ALTER TABLE lessons
  ADD COLUMN lesson_type lesson_type NOT NULL DEFAULT 'normal';

-- Drop the one-rider-per-lesson constraint; enforcement moves to the trigger below
ALTER TABLE lesson_riders
  DROP CONSTRAINT lesson_riders_lesson_id_unique;

-- Trigger function enforces participant counts per lesson type.
-- Registered as DEFERRABLE INITIALLY DEFERRED so multi-row group-lesson
-- inserts within one transaction don't trip the ≥2-rider check prematurely.
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
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER lesson_riders_participant_count_check
  AFTER INSERT OR UPDATE OR DELETE ON lesson_riders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_lesson_participant_counts();

CREATE CONSTRAINT TRIGGER lesson_horses_participant_count_check
  AFTER INSERT OR UPDATE OR DELETE ON lesson_horses
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION enforce_lesson_participant_counts();
