-- Allow unauthenticated visitors to read barn info (needed for barn login page)
CREATE POLICY "barns_anon_read" ON public.barns
  FOR SELECT TO anon USING (true);
