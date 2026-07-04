-- lessons.instructor_id now stores a barn_memberships.id (see the FK migration in this
-- issue), not an auth.users.id. Re-point every policy that compared
-- "instructor_id = auth.uid()" to instead check that the instructor's membership row
-- belongs to the calling user.

DROP POLICY "lessons_update_trainer" ON public.lessons;

CREATE POLICY "lessons_update_trainer" ON public.lessons
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.id = lessons.instructor_id
        AND bm.user_id = auth.uid()
        AND bm.barn_id = lessons.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.id = lessons.instructor_id
        AND bm.user_id = auth.uid()
        AND bm.barn_id = lessons.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

DROP POLICY "lesson_horses_delete_trainer" ON public.lesson_horses;

CREATE POLICY "lesson_horses_delete_trainer" ON public.lesson_horses
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.barn_memberships bm ON bm.id = l.instructor_id
    WHERE l.id = lesson_horses.lesson_id
      AND l.barn_id = lesson_horses.barn_id
      AND bm.user_id = auth.uid()
      AND bm.barn_id = lesson_horses.barn_id
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  ));

DROP POLICY "lesson_riders_delete_trainer" ON public.lesson_riders;

CREATE POLICY "lesson_riders_delete_trainer" ON public.lesson_riders
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.barn_memberships bm ON bm.id = l.instructor_id
    WHERE l.id = lesson_riders.lesson_id
      AND l.barn_id = lesson_riders.barn_id
      AND bm.user_id = auth.uid()
      AND bm.barn_id = lesson_riders.barn_id
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  ));
