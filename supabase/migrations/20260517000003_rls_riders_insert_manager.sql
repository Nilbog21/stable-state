-- Split riders_barn_member (FOR ALL) into per-operation policies.
-- SELECT: all active barn members; INSERT: managers only.

DROP POLICY "riders_barn_member" ON public.riders;

CREATE POLICY "riders_select" ON public.riders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = riders.barn_id AND status = 'active'
  ));

CREATE POLICY "riders_insert" ON public.riders
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = riders.barn_id
      AND status = 'active' AND role = 'manager'
  ));
