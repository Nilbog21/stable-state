-- #1003 review fix: photo_uploaded_by was added with a bare single-column FK.
-- Every other membership-referencing column (horses.owning_member_id included)
-- uses the composite (barn_id, id) form so a cross-barn membership id can't be
-- stored. Align photo_uploaded_by with that convention.
ALTER TABLE public.horses DROP CONSTRAINT horses_photo_uploaded_by_fkey;
ALTER TABLE public.horses
  ADD CONSTRAINT horses_barn_id_photo_uploaded_by_fkey
  FOREIGN KEY (barn_id, photo_uploaded_by) REFERENCES public.barn_memberships (barn_id, id)
  ON DELETE SET NULL (photo_uploaded_by);
