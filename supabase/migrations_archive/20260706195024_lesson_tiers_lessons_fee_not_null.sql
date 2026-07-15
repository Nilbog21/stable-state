DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM lesson_tiers WHERE price IS NULL) THEN
    RAISE EXCEPTION 'lesson_tiers has rows with a NULL price; backfill before enforcing NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM lessons WHERE fee IS NULL) THEN
    RAISE EXCEPTION 'lessons has rows with a NULL fee; backfill before enforcing NOT NULL';
  END IF;
END $$;

ALTER TABLE lesson_tiers ALTER COLUMN price SET NOT NULL;
ALTER TABLE lessons ALTER COLUMN fee SET NOT NULL;
