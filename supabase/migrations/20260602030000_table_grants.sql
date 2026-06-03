-- Grant CRUD on all existing tables to authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant SELECT on pre-auth tables to anon
GRANT SELECT ON public.barns TO anon;
-- roles_read_all policy (20260516000001) has no TO clause so already covers anon;
-- this grant is still required for Postgres-level access before RLS is evaluated.
GRANT SELECT ON public.roles TO anon;

-- Future tables created by postgres auto-grant to authenticated
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
