-- Replace manager-only UPDATE policies with manager+trainer
DROP POLICY IF EXISTS "lesson_riders_update" ON public.lesson_riders;
DROP POLICY IF EXISTS "lesson_horses_update" ON public.lesson_horses;

CREATE POLICY "lesson_riders_update" ON public.lesson_riders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM barn_memberships
      WHERE user_id = auth.uid()
        AND barn_id = lesson_riders.barn_id
        AND status = 'active'
        AND role IN ('manager', 'trainer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM barn_memberships
      WHERE user_id = auth.uid()
        AND barn_id = lesson_riders.barn_id
        AND status = 'active'
        AND role IN ('manager', 'trainer')
    )
  );

CREATE POLICY "lesson_horses_update" ON public.lesson_horses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM barn_memberships
      WHERE user_id = auth.uid()
        AND barn_id = lesson_horses.barn_id
        AND status = 'active'
        AND role IN ('manager', 'trainer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM barn_memberships
      WHERE user_id = auth.uid()
        AND barn_id = lesson_horses.barn_id
        AND status = 'active'
        AND role IN ('manager', 'trainer')
    )
  );
