-- #1004 review fix: manager_documents_all is a barn-scoped FOR ALL grant covering the
-- entire documents bucket, so it let a manager write/delete a profile-photo storage
-- object for ANY profile in their barn -- including an already-claimed one -- even
-- though profiles_manager_update (on the profiles table itself) correctly restricts
-- manager writes to is_managed=true profiles. Carve the profile-photos prefix out of
-- the broad grant and give it its own is_managed-gated policy, so the storage layer
-- enforces the same restriction schema.md already documents.
DROP POLICY manager_documents_all ON storage.objects;
CREATE POLICY manager_documents_all ON storage.objects TO authenticated USING (
  bucket_id = 'documents'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'profile-photos'
) WITH CHECK (
  bucket_id = 'documents'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'profile-photos'
);

CREATE POLICY profile_photos_manager_write ON storage.objects FOR ALL TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = ((storage.foldername(name))[3])::uuid
      AND p.is_managed = true
  )
) WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = ((storage.foldername(name))[3])::uuid
      AND p.is_managed = true
  )
);
