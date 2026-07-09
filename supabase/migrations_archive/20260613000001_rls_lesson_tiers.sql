ALTER TABLE lesson_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager_all_lesson_tiers" ON lesson_tiers
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "trainer_select_lesson_tiers" ON lesson_tiers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.barn_id = lesson_tiers.barn_id
        AND bm.role = 'trainer'
        AND bm.status = 'active'
    )
  );
