ALTER TABLE lesson_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager_all_lesson_series" ON lesson_series
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "lesson_series_select_trainer" ON lesson_series
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.id = lesson_series.instructor_id
        AND bm.user_id = auth.uid()
        AND bm.barn_id = lesson_series.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "lesson_series_insert_trainer" ON lesson_series
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.id = lesson_series.instructor_id
        AND bm.user_id = auth.uid()
        AND bm.barn_id = lesson_series.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );

CREATE POLICY "lesson_series_update_trainer" ON lesson_series
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.id = lesson_series.instructor_id
        AND bm.user_id = auth.uid()
        AND bm.barn_id = lesson_series.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.id = lesson_series.instructor_id
        AND bm.user_id = auth.uid()
        AND bm.barn_id = lesson_series.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );
