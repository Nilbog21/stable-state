-- #1390: admits a barn manager alongside the owning member.
--
-- #1006 gave this function to the owning member alone because the manager already wrote the
-- same two columns through update_horse_details/HorseManagerForm. #1390 moves feed/medication
-- out of that form into its own Feed & Medication section, which every writer -- manager or
-- owner -- saves through this function, so the manager needs a branch here or the section is
-- read-only for the one role that owns the barn.
--
-- auth_is_barn_manager is the same helper every manager-gated policy uses; it is checked before
-- the ownership comparison so a manager who is not the owner passes on the first branch.
-- A trainer matches neither and still raises 'not_authorized' -- the horses table grants a
-- trainer SELECT only, and nothing about this change touches that.
--
-- Body-only change: signature, SECURITY DEFINER mode, search_path and grants are all as #1006
-- created them, so no REVOKE/GRANT is restated here.
CREATE OR REPLACE FUNCTION public.update_horse_notes(
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

  IF NOT auth_is_barn_manager(p_barn_id)
     AND v_membership_id IS DISTINCT FROM v_owning_member_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE horses
  SET feed_notes = p_feed_notes,
      medication_notes = p_medication_notes
  WHERE id = p_horse_id AND barn_id = p_barn_id;
END;
$$;
