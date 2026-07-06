-- lessons_select / lesson_horses_select / lesson_riders_select (from
-- 20260517000002_rls_lesson_delete.sql) only checked "active barn member",
-- letting a rider SELECT any lesson in the barn, not just ones they're
-- enrolled in. Split each into a staff policy (manager/trainer, unchanged
-- barn-wide access) and a rider policy scoped to lessons they participate in.

-- lessons
DROP POLICY "lessons_select" ON public.lessons;

CREATE POLICY "lessons_select_staff" ON public.lessons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lessons.barn_id AND status = 'active'
      AND role IN ('manager', 'trainer')
  ));

CREATE POLICY "lessons_select_rider" ON public.lessons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lesson_riders lr
    JOIN public.barn_memberships bm ON bm.id = lr.rider_id
    WHERE lr.lesson_id = lessons.id AND lr.barn_id = lessons.barn_id
      AND bm.user_id = auth.uid() AND bm.status = 'active'
  ));

-- lesson_horses
DROP POLICY "lesson_horses_select" ON public.lesson_horses;

CREATE POLICY "lesson_horses_select_staff" ON public.lesson_horses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lesson_horses.barn_id AND status = 'active'
      AND role IN ('manager', 'trainer')
  ));

CREATE POLICY "lesson_horses_select_rider" ON public.lesson_horses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lesson_riders lr
    JOIN public.barn_memberships bm ON bm.id = lr.rider_id
    WHERE lr.lesson_id = lesson_horses.lesson_id AND lr.barn_id = lesson_horses.barn_id
      AND bm.user_id = auth.uid() AND bm.status = 'active'
  ));

-- lesson_riders
DROP POLICY "lesson_riders_select" ON public.lesson_riders;

CREATE POLICY "lesson_riders_select_staff" ON public.lesson_riders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = lesson_riders.barn_id AND status = 'active'
      AND role IN ('manager', 'trainer')
  ));

CREATE POLICY "lesson_riders_select_rider" ON public.lesson_riders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lesson_riders self
    JOIN public.barn_memberships bm ON bm.id = self.rider_id
    WHERE self.lesson_id = lesson_riders.lesson_id AND self.barn_id = lesson_riders.barn_id
      AND bm.user_id = auth.uid() AND bm.status = 'active'
  ));
