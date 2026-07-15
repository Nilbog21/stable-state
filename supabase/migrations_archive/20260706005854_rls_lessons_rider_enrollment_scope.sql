-- lessons_select / lesson_horses_select / lesson_riders_select (from
-- 20260517000002_rls_lesson_delete.sql) only checked "active barn member",
-- letting a rider SELECT any lesson in the barn, not just ones they're
-- enrolled in. Split each into a staff policy (manager/trainer, unchanged
-- barn-wide access) and a rider policy scoped to lessons they participate in.

-- auth_is_enrolled_rider is SECURITY DEFINER so it bypasses RLS when reading
-- lesson_riders. lesson_riders_select_rider needs to check lesson_riders from
-- its own policy; without this bypass that self-reference causes "infinite
-- recursion detected in policy for relation lesson_riders" (same class of bug
-- auth_is_barn_manager exists to avoid for barn_memberships).
CREATE OR REPLACE FUNCTION public.auth_is_enrolled_rider(p_lesson_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lesson_riders lr
    JOIN public.barn_memberships bm ON bm.id = lr.rider_id
    WHERE lr.lesson_id = p_lesson_id AND lr.barn_id = p_barn_id
      AND bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_enrolled_rider(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_enrolled_rider(uuid, uuid) TO authenticated;

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
  USING (public.auth_is_enrolled_rider(lessons.id, lessons.barn_id));

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
  USING (public.auth_is_enrolled_rider(lesson_horses.lesson_id, lesson_horses.barn_id));

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
  USING (public.auth_is_enrolled_rider(lesson_riders.lesson_id, lesson_riders.barn_id));
