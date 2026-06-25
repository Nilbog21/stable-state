INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- Path convention: {barn_id}/horses/{horse_id}/{filename}
--                 {barn_id}/trainers/{trainer_user_id}/{filename}

-- Manager: full access, barn-scoped by first path component
CREATE POLICY "manager_documents_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'documents'
    AND auth_is_barn_manager((storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND auth_is_barn_manager((storage.foldername(name))[1]::uuid)
  );

-- Trainer: select horse docs only (second path component = 'horses')
CREATE POLICY "trainer_horse_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'horses'
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = (storage.foldername(name))[1]::uuid
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

-- Trainer: upload horse docs only
CREATE POLICY "trainer_horse_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'horses'
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = (storage.foldername(name))[1]::uuid
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

-- Rider: no policies → no storage access
