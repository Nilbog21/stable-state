CREATE POLICY "manager_all_agreements" ON agreements
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "rider_select_own_agreements" ON agreements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM barn_memberships bm
      WHERE bm.id = agreements.rider_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

CREATE POLICY "manager_all_agreement_charges" ON agreement_charges
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "rider_select_own_agreement_charges" ON agreement_charges
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM agreements a
      JOIN barn_memberships bm ON bm.id = a.rider_id
      WHERE a.id = agreement_charges.agreement_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );
