CREATE POLICY "lessons_update_trainer" ON public.lessons
  FOR UPDATE TO authenticated
  USING (
    instructor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = lessons.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    instructor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = lessons.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );
