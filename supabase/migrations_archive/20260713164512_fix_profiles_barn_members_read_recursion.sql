-- Fix (#779): profiles_barn_members_read's inline barn_memberships subquery is itself
-- subject to barn_memberships' own narrow RLS (own-row/manager-full-barn/
-- trainer-reads-riders). So a trainer viewing a manager's profile, or a rider viewing a
-- trainer's/manager's profile -- both newly reachable via #779's broadened roster --
-- got no rows back from that subquery and silently fell back to "Unknown Member".
-- Break the recursion with a SECURITY DEFINER helper, mirroring auth_is_barn_manager.

CREATE FUNCTION public.auth_can_read_barn_member_profile(p_profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM barn_memberships actor
    JOIN barn_memberships target ON target.barn_id = actor.barn_id
    WHERE actor.user_id = auth.uid()
      AND actor.status = 'active'
      AND actor.role = ANY (ARRAY['manager', 'trainer', 'rider'])
      AND target.profile_id = p_profile_id
  );
$$;

REVOKE ALL ON FUNCTION public.auth_can_read_barn_member_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_read_barn_member_profile(uuid) TO authenticated;

DROP POLICY profiles_barn_members_read ON public.profiles;

CREATE POLICY profiles_barn_members_read ON public.profiles FOR SELECT TO authenticated
USING (
  (auth.uid() = user_id) OR public.auth_can_read_barn_member_profile(profiles.id)
);
