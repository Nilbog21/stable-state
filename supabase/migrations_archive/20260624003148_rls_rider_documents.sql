-- manager: full CRUD, barn-scoped
CREATE POLICY "manager_all_rider_documents" ON public.rider_documents
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

-- trainer: SELECT only, active barn membership
CREATE POLICY "trainer_select_rider_documents" ON public.rider_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = rider_documents.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

-- rider: own rows only, active barn membership
CREATE POLICY "rider_select_own_rider_documents" ON public.rider_documents
  FOR SELECT TO authenticated
  USING (
    rider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = rider_documents.barn_id
        AND bm.role = 'rider'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "rider_insert_own_rider_documents" ON public.rider_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    rider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = rider_documents.barn_id
        AND bm.role = 'rider'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "rider_delete_own_rider_documents" ON public.rider_documents
  FOR DELETE TO authenticated
  USING (
    rider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = rider_documents.barn_id
        AND bm.role = 'rider'
        AND bm.status = 'active'
    )
  );
