-- #1069 review follow-up: set_horse_owner's privilege-elevation UPDATE had no
-- existence guard, unlike revoke_horse_privilege's DELETE ... RETURNING. If the
-- target member had no member_horse_privileges row it matched zero rows and the
-- function still returned success, leaving a horse "owned" by a member whose
-- privileges were never elevated, with nothing surfaced to the caller.
-- Raising (rather than upserting the missing row) preserves #998's invariant
-- that ownership *reassignment* is done from an existing Access grant -- the
-- horse detail page's Access table only offers members who already hold one and
-- is this function's only caller, so reaching this branch means a caller bug or
-- a direct RPC call, which should be loud. Scoped to reassignment deliberately:
-- createHorse still auto-assigns the creating member as owner at insert time
-- with no privileges row (see schema.md's owning_member_id note), so "owner
-- implies Access grant" is not a whole-table invariant -- it holds only for the
-- path that reaches this function.
-- The RAISE aborts the whole function body, so the horses UPDATE above rolls
-- back too: the caller gets both writes or neither, as before.
-- The horses UPDATE stays unguarded -- setHorseOwnerAction already does
-- getHorseById + notFound() before calling this.
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

  IF p_member_id IS NOT NULL THEN
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
  END IF;
END;
$$;
