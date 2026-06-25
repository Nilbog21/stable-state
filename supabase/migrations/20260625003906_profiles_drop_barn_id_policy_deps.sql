-- Drop policy and function dependencies on profiles.barn_id / profiles.role
-- so that 20260625003907 can DROP COLUMN those columns without error.

-- profiles_own_insert references barn_id IS NULL; recreate without it.
DROP POLICY IF EXISTS "profiles_own_insert" ON public.profiles;
CREATE POLICY "profiles_own_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- profiles_own_update references barn_id IS NULL; recreate without it.
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Drop profiles_manager_update first so we can drop the function it depends on.
DROP POLICY IF EXISTS "profiles_manager_update" ON public.profiles;

-- auth_get_profile_immutable_fields returns barn_id and role; return type must
-- change, so DROP then recreate (CREATE OR REPLACE cannot change return type).
DROP FUNCTION IF EXISTS auth_get_profile_immutable_fields(uuid);
CREATE FUNCTION auth_get_profile_immutable_fields(p_id uuid)
RETURNS TABLE(
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, email, first_name, last_name, created_at
  FROM public.profiles WHERE id = p_id;
$$;

-- Recreate profiles_manager_update without barn_id/role comparisons.
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
        AND existing.first_name = profiles.first_name
        AND existing.last_name = profiles.last_name
        AND existing.created_at = profiles.created_at
    )
  );
