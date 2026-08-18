-- Manager write on the new {barn_id}/horse-photos/{horse_id}/* prefix is already covered
-- by the existing manager_documents_all policy (FOR ALL, keyed only on foldername[1] =
-- barn_id). This adds the missing read: any active barn member (manager/trainer/rider),
-- matching horses' own barn-wide SELECT.
CREATE POLICY horse_photos_member_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'horse-photos'::text) AND public.auth_is_active_barn_member(((storage.foldername(name))[1])::uuid)));
