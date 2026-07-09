-- lesson_horses: allow trainers to DELETE rows for lessons they own (needed by update_lesson_with_participants)
CREATE POLICY "lesson_horses_delete_trainer" ON public.lesson_horses
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.barn_memberships bm ON bm.user_id = auth.uid()
    WHERE l.id = lesson_horses.lesson_id
      AND l.barn_id = lesson_horses.barn_id
      AND l.instructor_id = auth.uid()
      AND bm.barn_id = lesson_horses.barn_id
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  ));

-- lesson_riders: allow trainers to DELETE rows for lessons they own (needed by update_lesson_with_participants)
CREATE POLICY "lesson_riders_delete_trainer" ON public.lesson_riders
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.lessons l
    JOIN public.barn_memberships bm ON bm.user_id = auth.uid()
    WHERE l.id = lesson_riders.lesson_id
      AND l.barn_id = lesson_riders.barn_id
      AND l.instructor_id = auth.uid()
      AND bm.barn_id = lesson_riders.barn_id
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  ));
