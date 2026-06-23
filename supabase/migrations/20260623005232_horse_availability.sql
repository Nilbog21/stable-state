ALTER TABLE horses
  ADD COLUMN is_available BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN unavailability_reason TEXT;
