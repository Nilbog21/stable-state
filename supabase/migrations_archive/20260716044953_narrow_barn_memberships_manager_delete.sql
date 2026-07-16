-- #969: managers could delete any barn_memberships row in their barn, including
-- another manager's row or (bypassing the app's own check) their own via a direct
-- call. Narrow the policy to exclude manager-role rows entirely -- manager removal
-- now requires direct DB access.
DROP POLICY barn_memberships_manager_delete ON public.barn_memberships;

CREATE POLICY barn_memberships_manager_delete ON public.barn_memberships FOR DELETE TO authenticated USING (public.auth_is_barn_manager(barn_id) AND role <> 'manager'::text);
