-- #1037: the approve/reject flow is removed, so this policy has no callers left.
DROP POLICY barn_memberships_manager_approve ON public.barn_memberships;
