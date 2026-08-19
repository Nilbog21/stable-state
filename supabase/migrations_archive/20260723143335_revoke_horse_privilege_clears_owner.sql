-- #998 redesign: ownership is now managed as a row in the Access table (a
-- member must already have a member_horse_privileges grant to be marked
-- owner), so revoking that grant must clear horses.owning_member_id in the
-- same statement — same non-atomic-write concern #759/#1005/#1001/#998's
-- update_horse_details already closed, this time spanning two tables.
-- SECURITY INVOKER: the caller already holds RLS grants for both the
-- member_horse_privileges delete (manager FOR ALL) and the horses update
-- (horses_manager_update), so no privilege escalation is needed.
CREATE FUNCTION public.revoke_horse_privilege(p_privilege_id uuid, p_barn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_horse_id uuid;
  v_member_id uuid;
BEGIN
  DELETE FROM member_horse_privileges
  WHERE id = p_privilege_id AND barn_id = p_barn_id
  RETURNING horse_id, member_id INTO v_horse_id, v_member_id;

  IF v_horse_id IS NOT NULL THEN
    UPDATE horses
    SET owning_member_id = NULL
    WHERE id = v_horse_id AND barn_id = p_barn_id AND owning_member_id = v_member_id;
  END IF;
END;
$$;
