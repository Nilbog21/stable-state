-- #827: RPCs for the two lesson-transaction actions not covered by the create/update/
-- generate write paths (sync_lesson_transactions.sql) — explicitly collecting a payment,
-- and deleting a lesson while deciding what happens to its ledger rows.

-- collect_lesson_payment: re-derives fee/instructor_cut/instructor_id/lesson_at from the
-- lessons row itself (already the dual-written source of truth) and delegates to
-- sync_lesson_transactions, which handles both directions (p_payment_type non-null =
-- collect, null = revert to unpaid). Does not touch lessons.payment_type itself — the
-- legacy-column dual-write stays at the TS action layer (updatePaymentTypeAction), so
-- getOutstandingLessons keeps working unchanged until #831.
CREATE FUNCTION public.collect_lesson_payment(
  p_lesson_id uuid, p_barn_id uuid, p_payment_type payment_type_enum
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lesson lessons;
  v_is_instructor boolean;
BEGIN
  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id;
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

REVOKE EXECUTE ON FUNCTION public.collect_lesson_payment(uuid, uuid, payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collect_lesson_payment(uuid, uuid, payment_type_enum) TO authenticated;

-- delete_lesson_with_transactions: manager-only (matches the existing lessons_delete RLS
-- policy this replaces the plain `.delete()` call for). An uncollected lesson_fee row is
-- always deleted outright first (closes the gap where ON DELETE SET NULL would otherwise
-- leave a permanently-uncollected, untraceable orphan). A collected lesson_fee (+ its
-- instructor_payout) is only deleted when p_delete_collected is true; the default is to
-- keep it, which the ON DELETE SET NULL (lesson_id) FK on transactions already handles
-- once the lessons row itself is deleted below.
CREATE FUNCTION public.delete_lesson_with_transactions(
  p_lesson_id uuid, p_barn_id uuid, p_delete_collected boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM transactions
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind = 'lesson_fee' AND collected = false;

  IF p_delete_collected THEN
    DELETE FROM transactions
    WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind IN ('lesson_fee', 'instructor_payout');
  END IF;

  DELETE FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_lesson_with_transactions(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_lesson_with_transactions(uuid, uuid, boolean) TO authenticated;
