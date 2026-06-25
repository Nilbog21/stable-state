-- 20260623005232 does ADD COLUMN without IF NOT EXISTS. Since 20260623002000 already added
-- is_available (prereq migration), running 20260623005232 on a fresh DB would fail with
-- "column already exists". Pre-register it in the migration history so Supabase CLI skips it.
-- On dev (where 20260623005232 already ran), ON CONFLICT DO NOTHING is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'horses' AND column_name = 'is_available'
  ) THEN
    INSERT INTO supabase_migrations.schema_migrations (version)
    VALUES ('20260623005232')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
