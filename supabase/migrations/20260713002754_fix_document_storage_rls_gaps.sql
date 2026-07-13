-- #738 review follow-up: two gaps in the storage.objects layer that the table-level RLS work
-- in 20260713002753_rls_document_owner_membership_scope.sql didn't reach.

-- 1. trainer_rider_documents_select granted ANY active trainer SELECT on every object under
--    {barn_id}/riders/*, mirroring the trainer_select_rider_documents table policy already
--    dropped above for the same reason (AC #2: Documents section hidden entirely for any
--    other viewer). document-storage.ts's getSignedUrl uses a session-scoped client, so this
--    policy is genuinely enforced per-caller -- drop it so a trainer can't bypass the
--    table-level fix by calling the Storage API directly.
DROP POLICY trainer_rider_documents_select ON storage.objects;

-- 2. rider_own_documents_select/trainer_own_documents_select match on
--    (storage.foldername(name))[3] = auth.uid()::text -- i.e. they assume the third path
--    segment IS the caller's own auth user id. A managed/unclaimed member's documents are
--    uploaded under a membership-id path segment (see documents/new/actions.ts's
--    storageEntityId fallback); once that member claims their account via
--    claim_managed_member (which never rewrites storage_path), the path segment no longer
--    matches their new auth.uid(), so these policies would deny them read access to their own
--    pre-claim documents -- getSignedUrl throws, crashing the member detail page's unguarded
--    Promise.all. Rewrite SELECT to check ownership via the owning rider_documents/
--    staff_documents row (joined on storage_path) instead of the raw path segment, so
--    ownership tracks the DB row -- already membership-scoped and claim-agnostic -- rather
--    than whatever path segment happened to be used at upload time.
--    DELETE is left as-is: the app deletes the DB row before removing the storage object
--    (src/app/barn/[slug]/(protected)/members/[membership_id]/actions.ts), so a join against
--    the (by-then-deleted) DB row would never match; that delete's failure is already
--    swallowed (`.catch(() => {})`) as a best-effort cleanup, so the pre-claim-then-claim-
--    then-delete case only risks a harmless orphaned storage object, not a crash.
DROP POLICY rider_own_documents_select ON storage.objects;

CREATE POLICY rider_own_documents_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'riders'
  AND EXISTS (
    SELECT 1 FROM public.rider_documents rd
    JOIN public.barn_memberships bm ON bm.id = rd.rider_id
    WHERE rd.storage_path = name
      AND bm.user_id = auth.uid()
      AND bm.role = 'rider'
      AND bm.status = 'active'
  )
);

DROP POLICY trainer_own_documents_select ON storage.objects;

CREATE POLICY trainer_own_documents_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'trainers'
  AND EXISTS (
    SELECT 1 FROM public.staff_documents sd
    JOIN public.barn_memberships bm ON bm.id = sd.trainer_id
    WHERE sd.storage_path = name
      AND bm.user_id = auth.uid()
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  )
);
