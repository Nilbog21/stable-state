-- #1003: carve the horse-photos prefix out of the broad manager_documents_all grant
-- (same approach as 20260723022104_profile_photos_manager_write_lock.sql's profile-photos
-- carve-out) and give it its own dynamically-locked policies -- a manager may write only
-- when the horse's photo isn't currently locked by its owner, and the owner may always
-- write their own horse's photo.
DROP POLICY manager_documents_all ON storage.objects;
CREATE POLICY manager_documents_all ON storage.objects TO authenticated USING (
  bucket_id = 'documents'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'profile-photos'
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'horse-photos'
) WITH CHECK (
  bucket_id = 'documents'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'profile-photos'
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'horse-photos'
);

CREATE POLICY horse_photos_manager_write ON storage.objects FOR ALL TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.horses h
    WHERE h.id = ((storage.foldername(name))[3])::uuid
      AND h.barn_id = ((storage.foldername(name))[1])::uuid
      AND (h.owning_member_id IS NULL OR h.photo_uploaded_by IS DISTINCT FROM h.owning_member_id)
  )
) WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.horses h
    WHERE h.id = ((storage.foldername(name))[3])::uuid
      AND h.barn_id = ((storage.foldername(name))[1])::uuid
      AND (h.owning_member_id IS NULL OR h.photo_uploaded_by IS DISTINCT FROM h.owning_member_id)
  )
);

CREATE POLICY horse_photos_owner_write ON storage.objects FOR ALL TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND EXISTS (
    SELECT 1 FROM public.horses h
    JOIN public.barn_memberships bm ON bm.id = h.owning_member_id
    WHERE h.id = ((storage.foldername(name))[3])::uuid
      AND h.barn_id = ((storage.foldername(name))[1])::uuid
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
) WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND EXISTS (
    SELECT 1 FROM public.horses h
    JOIN public.barn_memberships bm ON bm.id = h.owning_member_id
    WHERE h.id = ((storage.foldername(name))[3])::uuid
      AND h.barn_id = ((storage.foldername(name))[1])::uuid
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
);
