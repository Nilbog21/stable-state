CREATE POLICY "lessons_update" ON public.lessons
  FOR UPDATE TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "lesson_horses_update" ON public.lesson_horses
  FOR UPDATE TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "lesson_riders_update" ON public.lesson_riders
  FOR UPDATE TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));
