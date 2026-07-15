-- #739: resolveMemberNames (src/lib/db/barn-memberships.ts) fetches barn_memberships
-- rows by id to resolve a lesson's instructor_id to a name. No existing SELECT policy
-- covers a trainer/rider reading another member's row when that row's role is
-- trainer/manager, so instructor_name silently resolved to null for any lesson the
-- caller doesn't instruct/isn't enrolled in as the instructor's own row.

-- auth_can_read_instructor_membership is SECURITY DEFINER so it bypasses RLS when
-- reading lessons. A policy that subqueried lessons directly would recurse back into
-- barn_memberships via lessons_select_staff's own subquery — same infinite-recursion
-- class of bug auth_is_barn_manager/auth_is_enrolled_rider exist to avoid.
CREATE OR REPLACE FUNCTION public.auth_can_read_instructor_membership(p_membership_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.instructor_id = p_membership_id
      AND l.barn_id = p_barn_id
      AND (
        public.auth_is_barn_manager(p_barn_id)
        OR public.auth_is_barn_trainer(p_barn_id)
        OR public.auth_is_enrolled_rider(l.id, l.barn_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.auth_can_read_instructor_membership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_read_instructor_membership(uuid, uuid) TO authenticated;

CREATE POLICY "barn_memberships_read_as_instructor" ON public.barn_memberships
  FOR SELECT TO authenticated
  USING (public.auth_can_read_instructor_membership(id, barn_id));
