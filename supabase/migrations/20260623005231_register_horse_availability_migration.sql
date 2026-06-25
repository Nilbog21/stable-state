-- 20260623005232 does ADD COLUMN without IF NOT EXISTS. Since 20260623002000 already added
-- is_available/unavailability_reason as a prereq for the function migration, we must drop them
-- here so 20260623005232 can add them officially without "column already exists".
ALTER TABLE horses
  DROP COLUMN IF EXISTS is_available,
  DROP COLUMN IF EXISTS unavailability_reason;
