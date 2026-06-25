-- Allow riders to read barn-member profiles so instructor names resolve on lessons.
DROP POLICY IF EXISTS "profiles_barn_members_read" ON public.profiles;

CREATE POLICY "profiles_barn_members_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role IN ('manager', 'trainer', 'rider')
        AND target.user_id = profiles.user_id
    )
  );
