-- #1547: the delete half of "an owner gets full CRUD on their own horse's documents".
--
-- horse_documents had no privilege-based DELETE policy at all -- 20260722222911 defines SELECT and
-- INSERT only -- so this is a policy that has never existed rather than a widened one. Gated on
-- ownership directly, not on auth_get_horse_document_privilege() = 'write': the Access section's
-- three-way none/read/write control promises a granted rider reads and uploads, and nothing there
-- says anything about deletion. Additive, as ever -- Postgres OR-combines permissive policies, so
-- manager_all_horse_documents is unchanged.
CREATE POLICY horse_documents_delete_ownership ON public.horse_documents
  FOR DELETE TO authenticated
  USING (public.auth_is_horse_owner(horse_id, barn_id));

-- The storage half, which the table half is useless without: deleteHorseDocumentAction removes the
-- stored object after the row, and no policy on the documents bucket's horses/ prefix admitted a
-- non-manager to DELETE. That is exactly the gap #1359 closed for SELECT/INSERT, and it fails
-- quieter here -- the action already swallows a removeFile error, so every owner delete would have
-- orphaned its object with nothing surfaced. Managers keep deleting through manager_documents_all.
--
-- Path shape and the bare `name` reference match rider_horse_documents_select/_insert
-- (20260805141450): [1] barn id, [2] the 'horses' prefix, [3] horse id, and a direct helper call
-- rather than an EXISTS subquery, so the objects.name shadowing bug 20260723155501 fixed cannot
-- arise here.
CREATE POLICY rider_horse_documents_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'horses'
  AND public.auth_is_horse_owner(
        ((storage.foldername(name))[3])::uuid,
        ((storage.foldername(name))[1])::uuid
      )
);
