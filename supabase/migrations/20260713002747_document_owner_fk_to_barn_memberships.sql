-- #738: rider_documents.rider_id / staff_documents.trainer_id previously FK'd straight to
-- auth.users(id), so a managed/unclaimed member (user_id IS NULL) could never have documents
-- attached. Re-point both at barn_memberships(id) instead, mirroring the existing
-- lessons.instructor_id / lesson_riders.rider_id / agreements.rider_id precedent for
-- managed/stub members (see 20260704163936_lessons_instructor_id_fk_to_barn_memberships.sql).

-- Backfill existing rows: rider_id/trainer_id currently hold an auth.users id: resolve it to
-- the matching barn_memberships row for the same barn.
UPDATE public.rider_documents rd
SET rider_id = bm.id
FROM public.barn_memberships bm
WHERE bm.user_id = rd.rider_id AND bm.barn_id = rd.barn_id;

UPDATE public.staff_documents sd
SET trainer_id = bm.id
FROM public.barn_memberships bm
WHERE bm.user_id = sd.trainer_id AND sd.barn_id = bm.barn_id;

-- Defensive cleanup: a document's owner may have been removed from the barn (hard DELETE FROM
-- barn_memberships) after upload; under the old auth.users FK this left the document orphaned
-- but intact. Once rider_id/trainer_id must reference barn_memberships(id), such a row has no
-- valid target left. Confirmed zero such rows exist in stable-state-dev at the time of writing.
DELETE FROM public.rider_documents rd
WHERE NOT EXISTS (SELECT 1 FROM public.barn_memberships bm WHERE bm.id = rd.rider_id);

DELETE FROM public.staff_documents sd
WHERE NOT EXISTS (SELECT 1 FROM public.barn_memberships bm WHERE bm.id = sd.trainer_id);

ALTER TABLE public.rider_documents DROP CONSTRAINT rider_documents_rider_id_fkey;
ALTER TABLE public.staff_documents DROP CONSTRAINT staff_documents_trainer_id_fkey;

-- ON DELETE CASCADE matches lesson_riders/agreements (dependent records tied to the
-- membership), not lessons.instructor_id's SET NULL (financial history that must survive).
-- Removing a member now cascades their uploaded documents; RemoveMemberButton's confirm
-- copy is updated in the same PR to say so.
ALTER TABLE public.rider_documents
  ADD CONSTRAINT rider_documents_barn_id_rider_id_fkey
  FOREIGN KEY (barn_id, rider_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE;

ALTER TABLE public.staff_documents
  ADD CONSTRAINT staff_documents_barn_id_trainer_id_fkey
  FOREIGN KEY (barn_id, trainer_id) REFERENCES public.barn_memberships (barn_id, id) ON DELETE CASCADE;
