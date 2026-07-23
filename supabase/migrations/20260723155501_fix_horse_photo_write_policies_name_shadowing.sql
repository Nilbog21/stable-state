-- #1003 review fix: horse_photos_manager_write/horse_photos_owner_write's EXISTS subqueries
-- referenced an unqualified `name`, which Postgres resolved to horses.name (the horse's own
-- name, e.g. 'Butter') instead of the intended outer storage.objects.name (the storage path) --
-- horses.name has no '/', so storage.foldername() on it always returned an empty array, making
-- both EXISTS clauses permanently false and blocking every horse-photo upload/replace, manager
-- or owner alike. Qualifies every foldername() call inside the subqueries as objects.name.
DROP POLICY horse_photos_manager_write ON storage.objects;
CREATE POLICY horse_photos_manager_write ON storage.objects FOR ALL TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.horses h
    WHERE h.id = ((storage.foldername(objects.name))[3])::uuid
      AND h.barn_id = ((storage.foldername(objects.name))[1])::uuid
      AND (h.owning_member_id IS NULL OR h.photo_uploaded_by IS DISTINCT FROM h.owning_member_id)
  )
) WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND public.auth_is_barn_manager(((storage.foldername(name))[1])::uuid)
  AND EXISTS (
    SELECT 1 FROM public.horses h
    WHERE h.id = ((storage.foldername(objects.name))[3])::uuid
      AND h.barn_id = ((storage.foldername(objects.name))[1])::uuid
      AND (h.owning_member_id IS NULL OR h.photo_uploaded_by IS DISTINCT FROM h.owning_member_id)
  )
);

DROP POLICY horse_photos_owner_write ON storage.objects;
CREATE POLICY horse_photos_owner_write ON storage.objects FOR ALL TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND EXISTS (
    SELECT 1 FROM public.horses h
    JOIN public.barn_memberships bm ON bm.id = h.owning_member_id
    WHERE h.id = ((storage.foldername(objects.name))[3])::uuid
      AND h.barn_id = ((storage.foldername(objects.name))[1])::uuid
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
) WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horse-photos'
  AND EXISTS (
    SELECT 1 FROM public.horses h
    JOIN public.barn_memberships bm ON bm.id = h.owning_member_id
    WHERE h.id = ((storage.foldername(objects.name))[3])::uuid
      AND h.barn_id = ((storage.foldername(objects.name))[1])::uuid
      AND bm.user_id = auth.uid()
      AND bm.status = 'active'
  )
);
