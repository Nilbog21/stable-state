-- #830: rider cancellation fee via transactions.
--
-- sync_rider_cancellation_fee is a shared SECURITY DEFINER helper (mirrors
-- sync_lesson_transactions's shape/auth pattern), PERFORMed as a sub-step from both
-- normal-lesson cancellation entry points below. It only ever acts on a normal
-- (single-rider) lesson; group lessons no-op immediately, per #830's explicit
-- "no behavior change" requirement for group lessons.
--
-- The single DELETE ... RETURNING handles two acceptance criteria at once: it's a
-- no-op (0 rows, NOT FOUND) both when the lesson_fee transaction is already
-- collected=true (money already collected stays collected, no cancellation fee is
-- created) and when it's missing entirely (defensive).
--
-- occurred_at on the new rider_cancellation_fee row reuses the original lesson_fee
-- row's occurred_at (the lesson's scheduled time), not now(), so it stays in the same
-- reporting period as the fee it replaces once #831 cuts Finances over to reading
-- from transactions.
CREATE FUNCTION public.sync_rider_cancellation_fee(
  p_barn_id uuid, p_lesson_id uuid, p_lesson_type lesson_type, p_is_late boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fee_txn transactions;
  v_lesson_rider_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_active_barn_member(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_lesson_type <> 'normal' THEN
    RETURN;
  END IF;

  DELETE FROM transactions
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind = 'lesson_fee' AND collected = false
  RETURNING * INTO v_fee_txn;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_is_late THEN
    -- A normal lesson always has exactly 1 rider (assert_lesson_participant_counts).
    SELECT id INTO v_lesson_rider_id FROM lesson_riders WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id LIMIT 1;

    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, lesson_rider_id, occurred_at)
    VALUES (p_barn_id, 'rider_cancellation_fee', v_fee_txn.amount, false, NULL, v_lesson_rider_id, v_fee_txn.occurred_at);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_rider_cancellation_fee(uuid, uuid, lesson_type, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_rider_cancellation_fee(uuid, uuid, lesson_type, boolean) TO authenticated;

-- cancel_rider_participation: same signature as the prior version, so CREATE OR
-- REPLACE rather than DROP + CREATE. Adds v_lesson_type and a PERFORM of the new
-- helper. The existing UPDATE lessons SET fee = 0 ... dual-write is left completely
-- untouched (still fires for every lesson_type) — group-lesson legacy-column
-- behavior is explicitly out of scope for #830.
CREATE OR REPLACE FUNCTION cancel_rider_participation(
  p_lesson_id UUID,
  p_barn_id UUID,
  p_rider_id UUID,
  p_notes TEXT,
  p_is_late BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_instructor_id UUID;
  v_lesson_cancelled_at TIMESTAMPTZ;
  v_lesson_at TIMESTAMPTZ;
  v_lesson_type lesson_type;
  v_is_self BOOLEAN;
  v_is_instructor BOOLEAN;
  v_effective_is_late BOOLEAN;
  v_updated INT;
  v_remaining_active INT;
  v_cascaded BOOLEAN := false;
BEGIN
  SELECT instructor_id, cancelled_at, lesson_at, lesson_type
  INTO v_instructor_id, v_lesson_cancelled_at, v_lesson_at, v_lesson_type
  FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson_not_found';
  END IF;

  IF v_lesson_cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'lesson_already_cancelled';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = p_rider_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_self;

  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE id = v_instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
  ) INTO v_is_instructor;

  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR (auth_is_barn_trainer(p_barn_id) AND v_is_instructor)
    OR v_is_self
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_effective_is_late := CASE WHEN v_is_self THEN (v_lesson_at - now() <= INTERVAL '24 hours') ELSE p_is_late END;

  UPDATE lesson_riders
  SET cancelled_at = now(), cancellation_notes = p_notes
  WHERE lesson_id = p_lesson_id AND rider_id = p_rider_id AND barn_id = p_barn_id
    AND cancelled_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'rider_not_found_or_already_cancelled';
  END IF;

  IF NOT v_effective_is_late THEN
    UPDATE lessons SET fee = 0, payment_type = NULL WHERE id = p_lesson_id AND barn_id = p_barn_id;
  END IF;

  PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson_type, v_effective_is_late);

  SELECT count(*) INTO v_remaining_active
  FROM lesson_riders
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND cancelled_at IS NULL;

  IF v_remaining_active = 0 THEN
    UPDATE lessons SET cancelled_at = now() WHERE id = p_lesson_id AND barn_id = p_barn_id;
    v_cascaded := true;
  END IF;

  RETURN v_cascaded;
END;
$$;

-- cancel_lesson_with_transactions: new RPC replacing lessons.ts's cancelLesson()'s
-- former raw `.update()`. #825's "single Cancel entry point" consolidation left this
-- whole-lesson path reachable for every normal-lesson cancellation (regardless of
-- cancel_type) plus a group lesson's "Cancelled by Instructor" case — #830's own
-- acceptance criteria anticipates this and asks for the same ledger handling here.
-- No "already cancelled" guard: matches the exact behavior of the raw update it
-- replaces (that guard already lives at the cancelLessonAction app layer).
CREATE FUNCTION public.cancel_lesson_with_transactions(
  p_lesson_id uuid, p_barn_id uuid, p_notes text, p_is_late boolean
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

  UPDATE lessons
  SET cancelled_at = now(),
      cancellation_notes = p_notes,
      fee = CASE WHEN p_is_late THEN fee ELSE 0 END,
      payment_type = CASE WHEN p_is_late THEN payment_type ELSE NULL END
  WHERE id = p_lesson_id AND barn_id = p_barn_id;

  PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson.lesson_type, p_is_late);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_lesson_with_transactions(uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_lesson_with_transactions(uuid, uuid, text, boolean) TO authenticated;
