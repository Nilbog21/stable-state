-- Grant full access on all existing public tables to service_role.
-- Supabase normally applies this at project creation, but the project was
-- missing these grants, causing the reset-db script to fail with
-- "permission denied" when using the service role key.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Ensure future tables also get the grant automatically.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
