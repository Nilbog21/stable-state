-- #779: any active barn member can now view the full Managers/Trainers/Riders roster
-- (Members list) and any other member's detail page. barn_memberships has no
-- column-level GRANT restriction for `authenticated`, so a broad row-level SELECT
-- policy would also expose invite_token — a live claim_managed_member bearer
-- credential (same bug class as #739 / 20260712133711, reverted the same day by
-- 20260712133712). Mirror that fix instead of adding a new RLS policy: leave
-- barn_memberships_manager_read_barn / barn_memberships_read_own /
-- barn_memberships_trainer_read_riders untouched, and add a column-limited
-- SECURITY DEFINER RPC that never selects invite_token.

CREATE FUNCTION public.auth_is_active_barn_member(p_barn_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid() AND barn_id = p_barn_id AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_active_barn_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_active_barn_member(uuid) TO authenticated;

CREATE FUNCTION public.get_active_barn_member_summaries(p_barn_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  profile_id uuid,
  role text,
  can_instruct boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT auth_is_active_barn_member(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT bm.id, bm.user_id, bm.profile_id, bm.role, bm.can_instruct, bm.created_at
  FROM barn_memberships bm
  WHERE bm.barn_id = p_barn_id
    AND bm.status = 'active'
  ORDER BY bm.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_barn_member_summaries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_barn_member_summaries(uuid) TO authenticated;
