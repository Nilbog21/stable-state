-- #1003: lets a horse's owning member set/replace/delete its photo, alongside managers.
-- Write is dynamically locked once the *owner* uploads: a manager may only overwrite a
-- photo whose photo_uploaded_by is NULL or does not match the horse's current
-- owning_member_id. Runs SECURITY DEFINER because horses' own RLS grants column-blind
-- UPDATE to managers only -- there is no owner-write policy on the table itself.
CREATE FUNCTION public.update_horse_photo(
  p_horse_id uuid,
  p_barn_id uuid,
  p_photo_path text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
  v_role text;
  v_owning_member_id uuid;
  v_photo_uploaded_by uuid;
BEGIN
  SELECT id, role INTO v_membership_id, v_role
  FROM barn_memberships
  WHERE user_id = auth.uid() AND barn_id = p_barn_id AND status = 'active';

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT owning_member_id, photo_uploaded_by INTO v_owning_member_id, v_photo_uploaded_by
  FROM horses
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'horse_not_found';
  END IF;

  IF NOT (
    v_membership_id = v_owning_member_id
    OR (
      v_role = 'manager'
      AND (v_owning_member_id IS NULL OR v_photo_uploaded_by IS DISTINCT FROM v_owning_member_id)
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE horses
  SET photo_path = p_photo_path,
      photo_uploaded_by = CASE WHEN p_photo_path IS NULL THEN NULL ELSE v_membership_id END
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_horse_photo(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_horse_photo(uuid, uuid, text) TO authenticated;
