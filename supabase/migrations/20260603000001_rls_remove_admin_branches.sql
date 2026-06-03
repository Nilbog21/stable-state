-- Remove all admin-specific branches from RLS policies.
-- Managers retain the same barn-scoped access they had; the global admin
-- branches are dropped. The DELETE policy is also broadened to allow
-- managers to remove active members (not just pending ones), matching the
-- removeMembershipAction capability that was previously admin-only.

-- barn_memberships: SELECT (managers read their barn)
DROP POLICY "barn_memberships_manager_read_barn" ON public.barn_memberships;

CREATE POLICY "barn_memberships_manager_read_barn" ON public.barn_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships mgr
      WHERE mgr.user_id = auth.uid()
        AND mgr.status = 'active'
        AND mgr.role = 'manager'
        AND mgr.barn_id = barn_memberships.barn_id
    )
  );

-- barn_memberships: UPDATE (managers approve pending memberships in their barn)
DROP POLICY "barn_memberships_manager_approve" ON public.barn_memberships;

CREATE POLICY "barn_memberships_manager_approve" ON public.barn_memberships
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.barn_memberships mgr
      WHERE mgr.user_id = auth.uid()
        AND mgr.status = 'active'
        AND mgr.role = 'manager'
        AND mgr.barn_id = barn_memberships.barn_id
    )
  )
  WITH CHECK (status = 'active');

-- barn_memberships: DELETE (managers can delete any membership in their barn)
DROP POLICY "barn_memberships_manager_delete" ON public.barn_memberships;

CREATE POLICY "barn_memberships_manager_delete" ON public.barn_memberships
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships mgr
      WHERE mgr.user_id = auth.uid()
        AND mgr.status = 'active'
        AND mgr.role = 'manager'
        AND mgr.barn_id = barn_memberships.barn_id
    )
  );

-- profiles: managers read profiles of users in their barn (no more global admin read)
DROP POLICY "profiles_manager_read" ON public.profiles;

CREATE POLICY "profiles_manager_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.user_id = profiles.user_id
    )
  );

-- lessons: DELETE (managers only, barn-scoped)
DROP POLICY "lessons_delete" ON public.lessons;

CREATE POLICY "lessons_delete" ON public.lessons
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND mgr.role = 'manager'
      AND mgr.barn_id = lessons.barn_id
  ));

-- lesson_horses: DELETE (managers only, barn-scoped)
DROP POLICY "lesson_horses_delete" ON public.lesson_horses;

CREATE POLICY "lesson_horses_delete" ON public.lesson_horses
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND mgr.role = 'manager'
      AND mgr.barn_id = lesson_horses.barn_id
  ));

-- lesson_riders: DELETE (managers only, barn-scoped)
DROP POLICY "lesson_riders_delete" ON public.lesson_riders;

CREATE POLICY "lesson_riders_delete" ON public.lesson_riders
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND mgr.role = 'manager'
      AND mgr.barn_id = lesson_riders.barn_id
  ));

-- horses: INSERT/UPDATE/DELETE (managers only, barn-scoped)
DROP POLICY "horses_manager_write" ON public.horses;

CREATE POLICY "horses_manager_write" ON public.horses
  FOR INSERT UPDATE DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND mgr.role = 'manager'
      AND mgr.barn_id = horses.barn_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND mgr.role = 'manager'
      AND mgr.barn_id = horses.barn_id
  ));

-- riders: INSERT (managers only, barn-scoped; drop global admin branch)
DROP POLICY "riders_insert" ON public.riders;

CREATE POLICY "riders_insert" ON public.riders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barn_memberships
      WHERE user_id = auth.uid()
        AND barn_id = riders.barn_id
        AND status = 'active'
        AND role = 'manager'
    )
  );
