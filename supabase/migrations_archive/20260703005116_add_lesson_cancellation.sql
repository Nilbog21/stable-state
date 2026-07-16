ALTER TABLE lessons
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancellation_notes TEXT;
