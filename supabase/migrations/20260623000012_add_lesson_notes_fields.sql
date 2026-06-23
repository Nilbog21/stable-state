ALTER TABLE lesson_riders
  ADD COLUMN rider_notes TEXT,
  ADD COLUMN private_notes TEXT;

ALTER TABLE lesson_horses
  ADD COLUMN horse_notes TEXT;
