-- Break infinite recursion in barn_memberships RLS policies.
-- The manager policies query barn_memberships from within a barn_memberships
-- policy, causing PostgreSQL to recurse infinitely. A SECURITY DEFINER function
-- bypasses RLS when checking manager status, stopping the recursion.

CREATE OR REPLACE FUNCTION auth_is_barn_manager(p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid()
      AND barn_id = p_barn_id
      AND status = 'active'
      AND role = 'manager'
  );
$$;

-- barn_memberships: SELECT (managers read their barn)
DROP POLICY "barn_memberships_manager_read_barn" ON public.barn_memberships;

CREATE POLICY "barn_memberships_manager_read_barn" ON public.barn_memberships
  FOR SELECT TO authenticated
  USING (auth_is_barn_manager(barn_memberships.barn_id));

-- barn_memberships: UPDATE (managers approve pending memberships)
DROP POLICY "barn_memberships_manager_approve" ON public.barn_memberships;

CREATE POLICY "barn_memberships_manager_approve" ON public.barn_memberships
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND auth_is_barn_manager(barn_memberships.barn_id)
  )
  WITH CHECK (status = 'active');

-- barn_memberships: DELETE (managers delete any membership in their barn)
DROP POLICY "barn_memberships_manager_delete" ON public.barn_memberships;

CREATE POLICY "barn_memberships_manager_delete" ON public.barn_memberships
  FOR DELETE TO authenticated
  USING (auth_is_barn_manager(barn_memberships.barn_id));
