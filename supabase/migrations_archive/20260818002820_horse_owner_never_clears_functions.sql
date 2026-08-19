-- #1549: horses.owning_member_id is NOT NULL, so the two functions that used to
-- write NULL into it can no longer do so. Both would now raise a constraint
-- violation on the path they were written to serve.

-- set_horse_owner: ownership transfers, never clears. The IF p_member_id IS NOT
-- NULL guard existed only to skip the privilege elevation on a clear; with no
-- clear left, the elevation is unconditional. Everything else is unchanged --
-- the privilege_grant_not_found raise (#1069 review follow-up) still aborts the
-- whole body, so the caller gets both writes or neither.
--
-- p_member_id stays nullable in the signature rather than being narrowed: the
-- parameter's type is part of the RPC's identity in PostgREST's schema cache,
-- and a NULL now fails loudly on the horses UPDATE, which is the right outcome
-- for a direct call.
CREATE OR REPLACE FUNCTION public.set_horse_owner(p_horse_id uuid, p_barn_id uuid, p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_privilege_id uuid;
BEGIN
  UPDATE horses
  SET owning_member_id = p_member_id
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  UPDATE member_horse_privileges
  SET document_privileges = 'write', lesson_read_privileges = true
  WHERE barn_id = p_barn_id AND horse_id = p_horse_id AND member_id = p_member_id
  RETURNING id INTO v_privilege_id;

  IF v_privilege_id IS NULL THEN
    -- Static token, matching update_horse_notes/update_horse_photo's
    -- 'horse_not_found': callers surface an RPC error's message verbatim via
    -- getErrorMessage, so ids must not be interpolated into it.
    RAISE EXCEPTION 'privilege_grant_not_found';
  END IF;
END;
$$;

-- revoke_horse_privilege: #998 had it clear owning_member_id alongside the row,
-- because back then ownership was *expressed* as an Access grant and revoking
-- the grant had to take the ownership with it. Since #1547 ownership stands on
-- its own -- auth_is_horse_owner confers document write and lesson read with no
-- privileges row at all -- so an owner who loses their grant keeps exactly the
-- access they had, and the Access table keeps showing them (the owner's row is
-- synthesised from horses.owning_member_id, grant or no grant).
--
-- Revoke is therefore hidden on the owner's row: the button would delete a row
-- nothing displays and leave the screen unchanged. Reassignment is how the
-- Owner column moves now.
CREATE OR REPLACE FUNCTION public.revoke_horse_privilege(p_privilege_id uuid, p_barn_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM member_horse_privileges
  WHERE id = p_privilege_id AND barn_id = p_barn_id;
END;
$$;
