-- #864: per the barn manager's decision on #780, a rider viewing their own member page
-- keeps read access to their own rider_documents but loses self-service upload/delete —
-- managers remain the only role that can add or remove a rider's documents. Drops the
-- rider-self INSERT/DELETE policies (table + storage) added in
-- 20260713181711_rls_document_owner_membership_scope.sql / 20260629004612_baseline_rls.sql;
-- rider_select_own_rider_documents / rider_own_documents_select (read) are untouched, as is
-- manager_all_rider_documents.

DROP POLICY rider_insert_own_rider_documents ON public.rider_documents;
DROP POLICY rider_delete_own_rider_documents ON public.rider_documents;

DROP POLICY rider_own_documents_insert ON storage.objects;
DROP POLICY rider_own_documents_delete ON storage.objects;
