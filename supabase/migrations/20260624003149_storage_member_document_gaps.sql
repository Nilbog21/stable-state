-- trainer_documents table: allow trainers to insert and delete own rows
CREATE POLICY "trainer_insert_own_trainer_documents" ON public.trainer_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = trainer_documents.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "trainer_delete_own_trainer_documents" ON public.trainer_documents
  FOR DELETE TO authenticated
  USING (
    trainer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = trainer_documents.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

-- Storage: trainer can upload/delete own trainer documents
-- Path: {barn_id}/trainers/{trainer_user_id}/{filename}
CREATE POLICY "trainer_own_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'trainers'
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = (storage.foldername(name))[1]::uuid
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "trainer_own_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'trainers'
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = (storage.foldername(name))[1]::uuid
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

-- Storage: trainer can view rider documents
-- Path: {barn_id}/riders/{rider_user_id}/{filename}
CREATE POLICY "trainer_rider_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'riders'
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = (storage.foldername(name))[1]::uuid
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

-- Storage: rider can view/upload/delete own rider documents
CREATE POLICY "rider_own_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'riders'
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = (storage.foldername(name))[1]::uuid
        AND bm.role = 'rider'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "rider_own_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'riders'
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = (storage.foldername(name))[1]::uuid
        AND bm.role = 'rider'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "rider_own_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'riders'
    AND (storage.foldername(name))[3] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = (storage.foldername(name))[1]::uuid
        AND bm.role = 'rider'
        AND bm.status = 'active'
    )
  );
