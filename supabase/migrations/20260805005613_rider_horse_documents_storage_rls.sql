-- #1359: storage.objects policies admitting privilege-granted riders on the
-- documents bucket's horses/ prefix. #997/#999 granted the horse_documents
-- *table* to privileged riders (SELECT for 'read'/'write', INSERT for 'write',
-- 20260722222911) but no storage policy followed, so the horse detail page's
-- getSignedUrl threw on the RLS denial and the page 500'd for exactly the
-- riders the grant admitted. Additive only — Postgres OR-combines permissive
-- policies, so manager/trainer access is unchanged.
--
-- Both checks are direct calls to the SECURITY DEFINER helper the table
-- policies already use (recursion-safe, already granted to authenticated).
-- No EXISTS subquery means the objects.name shadowing bug 20260723155501
-- fixed cannot arise here: the bare `name` below is unambiguously
-- storage.objects.name.

CREATE POLICY rider_horse_documents_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horses'
  AND public.auth_get_horse_document_privilege(
        ((storage.foldername(name))[3])::uuid,
        ((storage.foldername(name))[1])::uuid
      ) IN ('read', 'write')
);

CREATE POLICY rider_horse_documents_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horses'
  AND public.auth_get_horse_document_privilege(
        ((storage.foldername(name))[3])::uuid,
        ((storage.foldername(name))[1])::uuid
      ) = 'write'
);
