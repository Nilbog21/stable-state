-- Fix 1: add active barn membership scope to trainer SELECT on trainer_documents
-- Without this, a trainer whose membership is revoked retains read access indefinitely.
DROP POLICY "trainer_select_own_trainer_documents" ON public.trainer_documents;

CREATE POLICY "trainer_select_own_trainer_documents" ON public.trainer_documents
  FOR SELECT TO authenticated
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

-- Fix 2: allow trainers to download their own trainer document files from storage
-- Path: {barn_id}/trainers/{trainer_user_id}/{filename}
-- Table-level RLS grants SELECT on trainer_documents rows; this closes the storage gap.
CREATE POLICY "trainer_own_documents_select" ON storage.objects
  FOR SELECT TO authenticated
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
