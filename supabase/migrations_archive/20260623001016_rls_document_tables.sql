-- horse_documents: manager full CRUD, trainer insert+select (barn-scoped), rider no access
CREATE POLICY "manager_all_horse_documents" ON public.horse_documents
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "trainer_select_horse_documents" ON public.horse_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = horse_documents.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "trainer_insert_horse_documents" ON public.horse_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = horse_documents.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

-- trainer_documents: manager full CRUD, trainer select own rows only
CREATE POLICY "manager_all_trainer_documents" ON public.trainer_documents
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "trainer_select_own_trainer_documents" ON public.trainer_documents
  FOR SELECT TO authenticated
  USING (trainer_id = auth.uid());
