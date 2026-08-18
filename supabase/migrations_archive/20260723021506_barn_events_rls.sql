-- #1014: RLS for barn_events. Manager gets unconditional CRUD; every active
-- barn member (including manager) gets SELECT filtered to rows where
-- visible_to_roles contains their own role. Plain subquery to
-- barn_memberships is safe here (no recursion) since this policy is defined
-- on barn_events, not on barn_memberships itself -- see ARCHITECTURE.md's
-- RLS conventions for the recursion class this would otherwise hit.

ALTER TABLE public.barn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY manager_all_barn_events ON public.barn_events
  FOR ALL TO authenticated
  USING (public.auth_is_barn_manager(barn_id))
  WITH CHECK (public.auth_is_barn_manager(barn_id));

CREATE POLICY barn_events_select_visible_role ON public.barn_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships bm
      WHERE bm.barn_id = barn_events.barn_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (barn_events.visible_to_roles)
    )
  );
