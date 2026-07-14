-- #827 review follow-up: fix findings from /reviewIssue.
--
-- 1. sync_lesson_transactions had no authorization check at all despite being
--    SECURITY DEFINER and GRANTed to authenticated — any authenticated user could
--    call it directly to fabricate/overwrite lesson_fee/instructor_payout rows for
--    any barn's any lesson. Add a barn-membership check (auth_is_active_barn_member,
--    not manager/trainer-only) since lessons_insert RLS already lets any active barn
--    member — including a rider — create a lesson, and this function is PERFORMed
--    from create_lesson_with_participants for that same caller. auth.uid() is NULL
--    for a service-role caller (see create_or_update_notification's doc for the same
--    pattern), so the check is skipped in that case — reset-db.ts and other scripts
--    call the shared create/update RPCs under service-role auth via the DAL, and
--    service_role already bypasses RLS on every table this function touches anyway.
--
-- 2. instructor_payout was only created once a lesson was collected, so a pending
--    lesson's LessonFeeRow.instructorCut was always 0 and pendingIncome never netted
--    the instructor's cut (contradicting ARCHITECTURE.md's documented behavior). Now
--    always upserted, with its own collected flag mirroring the lesson_fee row's.
--
-- 3. delete_lesson_with_transactions's unconditional cleanup only covered an
--    uncollected lesson_fee row; now that an uncollected instructor_payout row can
--    also exist (per #2 above), it needs the same cleanup or it becomes a permanent
--    orphan via transactions' own ON DELETE SET NULL (lesson_id) FK once the lesson
--    row is deleted.
--
-- 4. collect_lesson_payment read the lessons row without FOR UPDATE, unlike the
--    locking precedent cancel_rider_participation set for the same read-then-write
--    shape — a concurrent update_lesson_with_participants edit could race it and
--    leave transactions reflecting a stale fee/cut.
CREATE OR REPLACE FUNCTION public.sync_lesson_transactions(
  p_barn_id uuid, p_lesson_id uuid, p_fee numeric, p_instructor_cut numeric,
  p_instructor_id uuid, p_payment_type payment_type_enum, p_occurred_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_collected boolean := (p_fee = 0) OR (p_payment_type IS NOT NULL);
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_active_barn_member(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, occurred_at, lesson_id)
  VALUES (p_barn_id, 'lesson_fee', p_fee, v_collected, p_payment_type, p_occurred_at, p_lesson_id)
  ON CONFLICT (lesson_id) WHERE kind = 'lesson_fee'
  DO UPDATE SET amount = EXCLUDED.amount, collected = EXCLUDED.collected,
    payment_type = EXCLUDED.payment_type, occurred_at = EXCLUDED.occurred_at;

  INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, membership_id, occurred_at, lesson_id)
  VALUES (p_barn_id, 'instructor_payout', -p_instructor_cut, v_collected, p_payment_type, p_instructor_id, p_occurred_at, p_lesson_id)
  ON CONFLICT (lesson_id) WHERE kind = 'instructor_payout'
  DO UPDATE SET amount = EXCLUDED.amount, collected = EXCLUDED.collected, payment_type = EXCLUDED.payment_type,
    membership_id = EXCLUDED.membership_id, occurred_at = EXCLUDED.occurred_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.collect_lesson_payment(
  p_lesson_id uuid, p_barn_id uuid, p_payment_type payment_type_enum
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lesson lessons;
  v_is_instructor boolean;
BEGIN
  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = v_lesson.instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_instructor;

  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR (auth_is_barn_trainer(p_barn_id) AND v_is_instructor)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  PERFORM sync_lesson_transactions(
    p_barn_id, p_lesson_id, v_lesson.fee, v_lesson.instructor_cut,
    v_lesson.instructor_id, p_payment_type, v_lesson.lesson_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_lesson_with_transactions(
  p_lesson_id uuid, p_barn_id uuid, p_delete_collected boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM transactions
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind IN ('lesson_fee', 'instructor_payout') AND collected = false;

  IF p_delete_collected THEN
    DELETE FROM transactions
    WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind IN ('lesson_fee', 'instructor_payout');
  END IF;

  DELETE FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id;
END;
$$;
