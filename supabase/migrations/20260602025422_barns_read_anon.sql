-- Allow unauthenticated (anon) users to read barns so the barn login page can render
DROP POLICY IF EXISTS "barns_read_authenticated" ON public.barns;

CREATE POLICY "barns_read_all" ON public.barns
  FOR SELECT USING (true);
