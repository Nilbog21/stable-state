ALTER TABLE public.barn_memberships
  DROP CONSTRAINT barn_memberships_user_id_barn_id_key;

CREATE UNIQUE INDEX barn_memberships_user_id_barn_id_key
  ON public.barn_memberships (user_id, barn_id)
  WHERE (user_id IS NOT NULL);
