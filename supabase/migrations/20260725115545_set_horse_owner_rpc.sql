-- #1069 review follow-up: setHorseOwnerAction wrote horses.owning_member_id
-- (via update_horse_details) and elevated member_horse_privileges as two
-- separate, non-transactional calls -- the same failure mode #759/#1005/
-- #1001/#998 already closed for update_horse_details, and revoke_horse_privilege
-- closed in the opposite direction (clearing owner on privilege revoke). This
-- is that RPC's forward-direction counterpart: set the owner and elevate
-- their privileges atomically, in one statement.
-- SECURITY INVOKER: the caller already holds RLS grants for both the horses
-- update (horses_manager_update) and the member_horse_privileges update
-- (manager FOR ALL), same reasoning as revoke_horse_privilege.
CREATE FUNCTION public.set_horse_owner(p_horse_id uuid, p_barn_id uuid, p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE horses
  SET owning_member_id = p_member_id
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  IF p_member_id IS NOT NULL THEN
    UPDATE member_horse_privileges
    SET document_privileges = 'write', lesson_read_privileges = true
    WHERE barn_id = p_barn_id AND horse_id = p_horse_id AND member_id = p_member_id;
  END IF;
END;
$$;
