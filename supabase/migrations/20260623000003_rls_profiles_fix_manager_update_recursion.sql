-- Fix infinite recursion in profiles_manager_update WITH CHECK.
-- The policy introduced in 20260622000002 does SELECT FROM profiles inside a
-- profiles WITH CHECK, which Postgres detects as a recursive policy reference.
-- A SECURITY DEFINER function bypasses RLS when fetching the pre-update row,
-- breaking the cycle — same pattern used by auth_is_barn_manager.

CREATE OR REPLACE FUNCTION auth_get_profile_immutable_fields(p_id uuid)
RETURNS TABLE(
  user_id uuid,
  email text,
  barn_id uuid,
  role text,
  first_name text,
  last_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, email, barn_id, role, first_name, last_name, created_at
  FROM public.profiles WHERE id = p_id;
$$;

DROP POLICY IF EXISTS "profiles_manager_update" ON public.profiles;

CREATE POLICY "profiles_manager_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.user_id = profiles.user_id
        AND target.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.user_id = profiles.user_id
        AND target.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM auth_get_profile_immutable_fields(profiles.id) AS existing
      WHERE existing.user_id IS NOT DISTINCT FROM profiles.user_id
        AND existing.email = profiles.email
        AND existing.barn_id IS NOT DISTINCT FROM profiles.barn_id
        AND existing.role IS NOT DISTINCT FROM profiles.role
        AND existing.first_name = profiles.first_name
        AND existing.last_name = profiles.last_name
        AND existing.created_at = profiles.created_at
    )
  );
