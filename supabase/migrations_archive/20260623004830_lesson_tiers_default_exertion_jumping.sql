ALTER TABLE lesson_tiers
  ADD COLUMN default_exertion_level SMALLINT CHECK (default_exertion_level >= 1 AND default_exertion_level <= 5),
  ADD COLUMN default_jumping BOOLEAN;
