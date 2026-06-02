-- Replace the FOR ALL barn-member policies on lesson tables with
-- per-operation policies. DELETE is restricted to managers/admins;
-- UPDATE is intentionally omitted (denied by default RLS).

-- lessons
DROP POLICY "lessons_barn_member" ON public.lessons;

CREATE POLICY "lessons_select" ON public.lessons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lessons.barn_id AND status = 'active'
  ));

CREATE POLICY "lessons_insert" ON public.lessons
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lessons.barn_id AND status = 'active'
  ));

CREATE POLICY "lessons_delete" ON public.lessons
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND (
        mgr.role = 'admin'
        OR (mgr.role = 'manager' AND mgr.barn_id = lessons.barn_id)
      )
  ));

-- lesson_horses
DROP POLICY "lesson_horses_barn_member" ON public.lesson_horses;

CREATE POLICY "lesson_horses_select" ON public.lesson_horses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lesson_horses.barn_id AND status = 'active'
  ));

CREATE POLICY "lesson_horses_insert" ON public.lesson_horses
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lesson_horses.barn_id AND status = 'active'
  ));

CREATE POLICY "lesson_horses_delete" ON public.lesson_horses
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND (
        mgr.role = 'admin'
        OR (mgr.role = 'manager' AND mgr.barn_id = lesson_horses.barn_id)
      )
  ));

-- lesson_riders
DROP POLICY "lesson_riders_barn_member" ON public.lesson_riders;

CREATE POLICY "lesson_riders_select" ON public.lesson_riders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lesson_riders.barn_id AND status = 'active'
  ));

CREATE POLICY "lesson_riders_insert" ON public.lesson_riders
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lesson_riders.barn_id AND status = 'active'
  ));

CREATE POLICY "lesson_riders_delete" ON public.lesson_riders
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships mgr
    WHERE mgr.user_id = auth.uid()
      AND mgr.status = 'active'
      AND (
        mgr.role = 'admin'
        OR (mgr.role = 'manager' AND mgr.barn_id = lesson_riders.barn_id)
      )
  ));
