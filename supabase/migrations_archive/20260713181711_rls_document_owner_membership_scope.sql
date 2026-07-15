-- #738: rider_id/trainer_id now hold a barn_memberships.id (see
-- 20260713002747_document_owner_fk_to_barn_memberships.sql), not an auth.users id, so the
-- self-service "own row" policies must check membership ownership instead of
-- `rider_id = auth.uid()` / `trainer_id = auth.uid()`.

DROP POLICY rider_select_own_rider_documents ON public.rider_documents;
DROP POLICY rider_insert_own_rider_documents ON public.rider_documents;
DROP POLICY rider_delete_own_rider_documents ON public.rider_documents;

CREATE POLICY rider_select_own_rider_documents ON public.rider_documents FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    WHERE bm.id = rider_documents.rider_id
      AND bm.user_id = auth.uid()
      AND bm.barn_id = rider_documents.barn_id
      AND bm.role = 'rider'
      AND bm.status = 'active'
  )
);

CREATE POLICY rider_insert_own_rider_documents ON public.rider_documents FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    WHERE bm.id = rider_documents.rider_id
      AND bm.user_id = auth.uid()
      AND bm.barn_id = rider_documents.barn_id
      AND bm.role = 'rider'
      AND bm.status = 'active'
  )
);

CREATE POLICY rider_delete_own_rider_documents ON public.rider_documents FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    WHERE bm.id = rider_documents.rider_id
      AND bm.user_id = auth.uid()
      AND bm.barn_id = rider_documents.barn_id
      AND bm.role = 'rider'
      AND bm.status = 'active'
  )
);

DROP POLICY trainer_select_own_staff_documents ON public.staff_documents;
DROP POLICY trainer_insert_own_staff_documents ON public.staff_documents;
DROP POLICY trainer_delete_own_staff_documents ON public.staff_documents;

CREATE POLICY trainer_select_own_staff_documents ON public.staff_documents FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    WHERE bm.id = staff_documents.trainer_id
      AND bm.user_id = auth.uid()
      AND bm.barn_id = staff_documents.barn_id
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  )
);

CREATE POLICY trainer_insert_own_staff_documents ON public.staff_documents FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    WHERE bm.id = staff_documents.trainer_id
      AND bm.user_id = auth.uid()
      AND bm.barn_id = staff_documents.barn_id
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  )
);

CREATE POLICY trainer_delete_own_staff_documents ON public.staff_documents FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    WHERE bm.id = staff_documents.trainer_id
      AND bm.user_id = auth.uid()
      AND bm.barn_id = staff_documents.barn_id
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  )
);

-- #738 (per #779/#815's flagged follow-up): Documents-section visibility is manager-or-self
-- only per #779's architecture rule; this RLS policy let ANY active trainer SELECT every
-- rider's documents in the barn at the DB level, bypassing that rule for direct callers even
-- though the UI already stopped rendering it for them. Drop it entirely rather than narrowing
-- it, matching AC #2's "hidden entirely for any other viewer."
DROP POLICY trainer_select_rider_documents ON public.rider_documents;
