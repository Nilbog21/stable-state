-- #1004: storage.objects policies for the new {barn_id}/profile-photos/{profile_id}/*
-- prefix. barn_id is kept as the first path segment purely so the existing
-- manager_documents_all policy's ((storage.foldername(name))[1])::uuid cast (evaluated
-- against every row in this single-bucket table) never sees a non-UUID first segment.
--
-- Manager write for managed/stub profiles is already covered by manager_documents_all
-- (barn-scoped FOR ALL) — same as horse-photos (20260722205014). The is_managed-only
-- restriction on *which* profiles a manager may touch is enforced in the server action,
-- mirroring updateContactInfoAction's existing check, not carved into storage RLS.
CREATE POLICY profile_photos_self_write ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = ((storage.foldername(name))[3])::uuid
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = ((storage.foldername(name))[3])::uuid
      AND p.user_id = auth.uid()
  )
);

-- Read is scoped by profile-read authorization (auth_can_read_barn_member_profile), not by
-- the storage path's barn_id segment — a profile can be visible from a different barn than
-- the one its photo happened to be uploaded under (multi-barn members), unlike horses which
-- belong to exactly one barn.
CREATE POLICY profile_photos_member_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'profile-photos'
  AND public.auth_can_read_barn_member_profile(((storage.foldername(name))[3])::uuid)
);
