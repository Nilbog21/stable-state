-- Prereq for 20260623003217: that function migration references h.is_available, but the column
-- was officially added in 20260623005232 which has a later timestamp. On a fresh DB the function
-- CREATE would fail (column does not exist yet). IF NOT EXISTS makes this safe on dev where the
-- column is already present.
ALTER TABLE horses
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unavailability_reason TEXT;
