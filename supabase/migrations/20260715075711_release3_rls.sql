-- Consolidated release-3 RLS squash (#658): final policies plus every function/
-- table GRANT/REVOKE touched since branching off `main` post-#657. Several
-- baseline-defined policies are replaced or dropped outright below (release-3
-- either rewrote their logic or removed them entirely) — each DROP targets the
-- baseline's original policy name; some tables were also renamed in the
-- companion schema file, so a policy's *name* may still be the baseline-era one
-- even though it's now attached to the renamed table.

-- barn_memberships: managed-member inserts for any role, not just rider.
DROP POLICY barn_memberships_manager_insert_managed ON public.barn_memberships;

CREATE POLICY "barn_memberships_manager_insert_managed" ON public.barn_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IS NULL
    AND invite_token IS NOT NULL
    AND status = 'active'
    AND role IN ('rider', 'trainer', 'manager')
    AND auth_is_barn_manager(barn_memberships.barn_id)
  );

-- barns
CREATE POLICY "manager_update_barns" ON barns
  FOR UPDATE TO authenticated
  USING (auth_is_barn_manager(id))
  WITH CHECK (auth_is_barn_manager(id));

-- notifications
CREATE POLICY "notifications_delete_own"
  ON notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- profiles: managed-only manager update, and recursion-safe barn-members read
DROP POLICY "profiles_manager_update" ON public.profiles;
CREATE POLICY "profiles_manager_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.profile_id = profiles.id
        AND target.status = 'active'
    )
    AND profiles.is_managed = true
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barn_memberships actor
      JOIN public.barn_memberships target ON target.barn_id = actor.barn_id
      WHERE actor.user_id = auth.uid()
        AND actor.status = 'active'
        AND actor.role = 'manager'
        AND target.profile_id = profiles.id
        AND target.status = 'active'
    )
    AND profiles.is_managed = true
    AND EXISTS (
      SELECT 1 FROM auth_get_profile_immutable_fields(profiles.id) AS existing
      WHERE existing.user_id IS NOT DISTINCT FROM profiles.user_id
        AND existing.email IS NOT DISTINCT FROM profiles.email
        AND existing.first_name = profiles.first_name
        AND existing.last_name = profiles.last_name
        AND existing.created_at = profiles.created_at
    )
  );

DROP POLICY profiles_barn_members_read ON public.profiles;
CREATE POLICY profiles_barn_members_read ON public.profiles FOR SELECT TO authenticated
USING (
  (auth.uid() = user_id) OR public.auth_can_read_barn_member_profile(profiles.id)
);

-- lessons / lesson_horses / lesson_riders: instructor comparisons re-pointed at
-- barn_memberships (instructor_id is now a membership id, not an auth user id),
-- plus the rider-enrollment SELECT scope split (staff barn-wide vs. rider own-only).

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

-- documents: rider_documents self-service (read-only, self-service upload/delete
-- removed entirely by #864), staff_documents (renamed from trainer_documents,
-- membership-scoped self-service), and storage.objects mirrors of both.

DROP POLICY rider_delete_own_rider_documents ON public.rider_documents;
DROP POLICY rider_insert_own_rider_documents ON public.rider_documents;
DROP POLICY rider_select_own_rider_documents ON public.rider_documents;
DROP POLICY trainer_select_rider_documents ON public.rider_documents;

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

DROP POLICY manager_all_trainer_documents ON public.staff_documents;
DROP POLICY trainer_delete_own_trainer_documents ON public.staff_documents;
DROP POLICY trainer_insert_own_trainer_documents ON public.staff_documents;
DROP POLICY trainer_select_own_trainer_documents ON public.staff_documents;

CREATE POLICY "manager_all_staff_documents" ON public.staff_documents
  TO authenticated
  USING (public.auth_is_barn_manager(barn_id))
  WITH CHECK (public.auth_is_barn_manager(barn_id));

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

-- storage.objects (bucket/RLS enablement provisioned by Supabase; only policies are ours)
DROP POLICY trainer_rider_documents_select ON storage.objects;
DROP POLICY rider_own_documents_delete ON storage.objects;
DROP POLICY rider_own_documents_insert ON storage.objects;
DROP POLICY rider_own_documents_select ON storage.objects;
DROP POLICY trainer_own_documents_select ON storage.objects;

CREATE POLICY rider_own_documents_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'riders'
  AND EXISTS (
    SELECT 1 FROM public.rider_documents rd
    JOIN public.barn_memberships bm ON bm.id = rd.rider_id
    WHERE rd.storage_path = name
      AND bm.user_id = auth.uid()
      AND bm.role = 'rider'
      AND bm.status = 'active'
  )
);

CREATE POLICY trainer_own_documents_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[2] = 'trainers'
  AND EXISTS (
    SELECT 1 FROM public.staff_documents sd
    JOIN public.barn_memberships bm ON bm.id = sd.trainer_id
    WHERE sd.storage_path = name
      AND bm.user_id = auth.uid()
      AND bm.role = 'trainer'
      AND bm.status = 'active'
  )
);

-- agreements / agreement_charges
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

-- horse_expenses / expense_horses
CREATE POLICY "manager_all_horse_expenses" ON horse_expenses
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

CREATE POLICY "manager_all_expense_horses" ON expense_horses
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));

-- lesson_series
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

-- transactions: manager-only SELECT; every write goes through SECURITY DEFINER RPCs
CREATE POLICY "manager_select_transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (auth_is_barn_manager(barn_id));

REVOKE INSERT, UPDATE, DELETE ON public.transactions FROM authenticated;

-- Function grants (independently verified against the real replay history, not
-- copy-pasted from whichever file happened to last touch a function's body —
-- CREATE OR REPLACE does not reset a function's previously-set GRANT/REVOKE state)

REVOKE EXECUTE ON FUNCTION create_managed_member(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_managed_member(UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_enrolled_rider(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_enrolled_rider(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_can_read_instructor_membership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_read_instructor_membership(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_instructor_membership_names(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_instructor_membership_names(uuid[], uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_active_barn_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_active_barn_member(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_active_barn_member_summaries(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_barn_member_summaries(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.assert_lesson_participant_counts(lesson_type, integer, integer) TO authenticated;

GRANT ALL ON FUNCTION public.create_lesson_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION create_lesson_series_with_participants(uuid, uuid, timestamptz, numeric, uuid[], integer[], uuid[], lesson_type, boolean, text, payment_type_enum, numeric) TO authenticated;
GRANT ALL ON FUNCTION public.update_lesson_with_participants(uuid, uuid, timestamptz, uuid, numeric, lesson_type, boolean, payment_type_enum, text, uuid[], integer[], uuid[], numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_lesson_for_series(uuid, uuid, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION get_horse_projected_exhaustion(UUID, UUID, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_horse_projected_exhaustion(UUID, UUID, TIMESTAMPTZ, UUID) TO authenticated;

REVOKE ALL ON FUNCTION get_horse_exertion_summary(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_horse_exertion_summary(uuid, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_lesson_transactions(uuid, uuid, numeric, numeric, uuid, payment_type_enum, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_lesson_transactions(uuid, uuid, numeric, numeric, uuid, payment_type_enum, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lesson_transactions(uuid, uuid, numeric, numeric, uuid, payment_type_enum, timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.collect_lesson_payment(uuid, uuid, payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collect_lesson_payment(uuid, uuid, payment_type_enum) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_lesson_with_transactions(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_lesson_with_transactions(uuid, uuid, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_lesson_payment_info(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_payment_info(uuid[], uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION cancel_rider_participation(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_rider_participation(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_lesson_with_transactions(uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_lesson_with_transactions(uuid, uuid, text, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_rider_cancellation_fee(uuid, uuid, lesson_type, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_rider_cancellation_fee(uuid, uuid, lesson_type, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.get_outstanding_transactions(uuid, uuid[], uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outstanding_transactions(uuid, uuid[], uuid[], uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.collect_rider_cancellation_fee(uuid, uuid, payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collect_rider_cancellation_fee(uuid, uuid, payment_type_enum) TO authenticated;

GRANT EXECUTE ON FUNCTION create_agreement_with_first_charge(uuid, uuid, uuid, numeric, agreement_kind, agreement_cadence, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION create_agreement_with_first_charge(uuid, uuid, uuid, numeric, agreement_kind, agreement_cadence, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_agreement_with_first_charge(uuid, uuid, uuid, numeric, agreement_kind, agreement_cadence, date) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION generate_agreement_charge(uuid, uuid, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION generate_agreement_charge(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_agreement_charge(uuid, uuid, date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION mark_agreement_charge_paid(uuid, uuid, payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_agreement_charge_paid(uuid, uuid, payment_type_enum) TO authenticated;

REVOKE EXECUTE ON FUNCTION update_agreement_charge_fee(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_agreement_charge_fee(uuid, uuid, numeric) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_expense_transaction(uuid, uuid, numeric, timestamptz, payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_expense_transaction(uuid, uuid, numeric, timestamptz, payment_type_enum) TO authenticated;

REVOKE EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_expense_with_horses(uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_expense_with_horses(uuid, uuid, date, text, boolean, time, numeric, text, text, uuid[], payment_type_enum) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION create_or_update_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_or_update_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
