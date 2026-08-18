-- #1549 (/testIssue round): transferring ownership leaves the outgoing owner a grant matching
-- the access ownership conferred them.
--
-- Until now the transfer was a silent revocation, and for exactly the grantless owner. Since
-- #1547 ownership confers document write and lesson read with no privileges row at all, and
-- createHorse assigns ownership without writing one -- which since #1549 is the *ordinary* state
-- of a horse rather than an edge case. The Access table synthesises that owner's row from
-- horses.owning_member_id, so the moment ownership moved the row had nothing left to stand on:
-- the outgoing owner disappeared from the table having lost every privilege they held, with
-- nothing on screen saying so.
--
-- Upsert rather than a plain INSERT because the outgoing owner may already hold a row -- a rider
-- granted access and then promoted keeps the one the promotion elevated. Writing 'write'/true on
-- both paths is what makes the outcome "the access they had *as owner*" in either case, rather
-- than whatever they happened to hold before being promoted.
--
-- This does not soften the privilege_grant_not_found raise below it. That guards the *incoming*
-- owner, whose grant row is still the precondition #998 established for reassignment; the row
-- written here is the outgoing owner's, which no caller was ever required to supply.
CREATE OR REPLACE FUNCTION public.set_horse_owner(p_horse_id uuid, p_barn_id uuid, p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_privilege_id uuid;
  v_previous_owner_id uuid;
BEGIN
  SELECT owning_member_id INTO v_previous_owner_id
  FROM horses
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  UPDATE horses
  SET owning_member_id = p_member_id
  WHERE id = p_horse_id AND barn_id = p_barn_id;

  -- Guarded on the id rather than left to the upsert: re-tapping the selected Owner radio is
  -- already a no-op in setHorseOwnerAction, but a direct call passing the current owner would
  -- otherwise write the incoming owner's own grant here and make the raise below unreachable.
  IF v_previous_owner_id IS NOT NULL AND v_previous_owner_id <> p_member_id THEN
    INSERT INTO member_horse_privileges (
      barn_id, horse_id, member_id, document_privileges, lesson_read_privileges
    )
    VALUES (p_barn_id, p_horse_id, v_previous_owner_id, 'write', true)
    ON CONFLICT (barn_id, member_id, horse_id)
    DO UPDATE SET document_privileges = 'write', lesson_read_privileges = true;
  END IF;

  UPDATE member_horse_privileges
  SET document_privileges = 'write', lesson_read_privileges = true
  WHERE barn_id = p_barn_id AND horse_id = p_horse_id AND member_id = p_member_id
  RETURNING id INTO v_privilege_id;

  IF v_privilege_id IS NULL THEN
    -- Static token, matching update_horse_notes/update_horse_photo's 'horse_not_found': callers
    -- surface an RPC error's message verbatim via getErrorMessage, so ids must not be
    -- interpolated into it.
    RAISE EXCEPTION 'privilege_grant_not_found';
  END IF;
END;
$$;
