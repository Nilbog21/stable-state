ALTER TABLE public.horses
  ADD COLUMN photo_uploaded_by uuid REFERENCES public.barn_memberships(id) ON DELETE SET NULL;
