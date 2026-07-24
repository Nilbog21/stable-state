-- #1006: lets a horse's owning member edit feed/medication notes for their own horse,
-- alongside managers (who keep writing these columns exclusively through
-- update_horse_details/HorseManagerForm, unchanged). Runs SECURITY DEFINER because
-- horses' own RLS grants column-blind UPDATE to managers only -- there is no
-- owner-write policy on the table itself. No dynamic lock like update_horse_photo's
-- (#1003): there's no "who wrote it last" concept for free-form notes.
CREATE FUNCTION public.update_horse_notes(
  p_horse_id uuid,
  p_barn_id uuid,
  p_feed_notes text,
  p_medication_notes text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
  v_owning_member_id uuid;
BEGIN
  SELECT id INTO v_membership_id
  FROM barn_memberships
  WHERE user_id = auth.uid() AND barn_id = p_barn_id AND status = 'active';

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT owning_member_id INTO v_owning_member_id
  FROM horses
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'horse_not_found';
  END IF;

  IF v_membership_id IS DISTINCT FROM v_owning_member_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE horses
  SET feed_notes = p_feed_notes,
      medication_notes = p_medication_notes
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_horse_notes(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_horse_notes(uuid, uuid, text, text) TO authenticated;
