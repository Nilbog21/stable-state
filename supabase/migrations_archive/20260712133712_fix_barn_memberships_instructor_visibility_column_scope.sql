-- #739 review fix: barn_memberships_read_as_instructor (20260712001445) granted
-- row-level SELECT on the full barn_memberships row, including invite_token — a
-- live bearer credential for claim_managed_member. Since barn_memberships has no
-- column-level GRANT restriction for `authenticated`, that policy let any trainer
-- or enrolled rider read an unclaimed instructor stub's invite_token directly and
-- hijack the stub via claim_managed_member. Replace the row-level policy with a
-- SECURITY DEFINER function that returns only the name columns resolveMemberNames
-- actually needs, mirroring get_horse_projected_exhaustion's column-limiting
-- pattern (ARCHITECTURE.md).
DROP POLICY "barn_memberships_read_as_instructor" ON public.barn_memberships;

CREATE FUNCTION public.get_instructor_membership_names(p_membership_ids uuid[], p_barn_id uuid)
RETURNS TABLE(id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bm.id, p.first_name, p.last_name
  FROM public.barn_memberships bm
  JOIN public.profiles p ON p.id = bm.profile_id
  WHERE bm.id = ANY(p_membership_ids)
    AND bm.barn_id = p_barn_id
    AND public.auth_can_read_instructor_membership(bm.id, bm.barn_id);
$$;

REVOKE ALL ON FUNCTION public.get_instructor_membership_names(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_membership_names(uuid[], uuid) TO authenticated;
