-- #1278 — Group-lesson cancellation zeroed the wrong fees.
--
-- A lesson carries its fee in two places: lessons.fee and the single lesson_fee transaction
-- keyed on lesson_id. Both cancellation RPCs wrote `fee = 0` on a non-late cancel ungated on
-- lesson_type, then PERFORMed sync_rider_cancellation_fee, which returned early for anything
-- non-'normal' *before* the ledger half. Two defects fell out:
--
--   * A whole group lesson cancelled early read $0 on its detail page while its uncollected
--     lesson_fee transaction survived at the full amount, so the barn went on counting the
--     money as Pending income.
--   * One rider cancelling >24h out of a group lesson zeroed the *whole lesson's* fee, for a
--     lesson the remaining riders still rode.
--
-- A normal lesson always has exactly one rider (assert_lesson_participant_counts), so the
-- ungated write was correct there; it is only wrong once the type allows more than one.
--
-- cancel_lesson_with_transactions is deliberately untouched: its
-- `fee = CASE WHEN p_is_late THEN fee ELSE 0 END` is already right for both types, and the
-- helper change below is what makes its PERFORM clear the ledger for a group lesson too.

-- The early return narrows to *late* group cancellations, which keep both the column and the
-- ledger row. A non-late group cancellation now falls through to the same delete-uncollected /
-- zero-already-collected block a normal lesson takes. The rider_cancellation_fee INSERT further
-- down is gated on p_is_late, which this return makes unreachable for a non-'normal' lesson —
-- so that row stays normal-only without a second guard.
CREATE OR REPLACE FUNCTION public.sync_rider_cancellation_fee(
  p_barn_id uuid, p_lesson_id uuid, p_lesson_type lesson_type, p_is_late boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fee_txn transactions;
  v_lesson_rider_id uuid;
  v_instructor_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT instructor_id INTO v_instructor_id FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id;

    IF NOT (
      auth_is_barn_manager(p_barn_id)
      OR (auth_is_barn_trainer(p_barn_id) AND EXISTS (
        SELECT 1 FROM barn_memberships
        WHERE id = v_instructor_id AND barn_id = p_barn_id AND user_id = auth.uid()
      ))
      OR EXISTS (
        SELECT 1 FROM lesson_riders lr
        JOIN barn_memberships bm ON bm.id = lr.rider_id AND bm.barn_id = p_barn_id
        WHERE lr.lesson_id = p_lesson_id AND lr.barn_id = p_barn_id AND bm.user_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  IF p_lesson_type <> 'normal' AND p_is_late THEN
    RETURN;
  END IF;

  DELETE FROM transactions
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind = 'lesson_fee' AND collected = false
  RETURNING * INTO v_fee_txn;

  IF NOT FOUND THEN
    IF NOT p_is_late THEN
      UPDATE transactions
      SET amount = 0, payment_type = NULL, collected = true
      WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND kind = 'lesson_fee';
    END IF;
    RETURN;
  END IF;

  IF p_is_late THEN
    -- Reachable only for a normal lesson (see the early return above), which always has
    -- exactly 1 rider (assert_lesson_participant_counts).
    SELECT id INTO v_lesson_rider_id FROM lesson_riders WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id LIMIT 1;

    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, lesson_rider_id, occurred_at)
    VALUES (p_barn_id, 'rider_cancellation_fee', v_fee_txn.amount, false, NULL, v_lesson_rider_id, v_fee_txn.occurred_at);
  END IF;
END;
$$;

-- The remaining-active-rider count moves above the fee handling so the cascade is known before
-- anything decides. Both fee writes are whole-lesson-scoped, so they now fire only when this
-- cancellation ends the lesson: on a normal lesson (its one rider just left) or on a group
-- lesson whose last active rider just left. A group lesson that still has riders keeps its fee
-- and its ledger row untouched.
--
-- 'normal' implies the cascade in practice, but the type check stays explicit:
-- assert_lesson_participant_counts binds at creation, not here, and the guarantee wanted is
-- that normal-lesson behaviour is unchanged in every branch.
CREATE OR REPLACE FUNCTION public.cancel_rider_participation(
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

  SELECT count(*) INTO v_remaining_active
  FROM lesson_riders
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND cancelled_at IS NULL;

  v_cascaded := (v_remaining_active = 0);

  IF v_lesson_type = 'normal' OR v_cascaded THEN
    IF NOT v_effective_is_late THEN
      UPDATE lessons SET fee = 0 WHERE id = p_lesson_id AND barn_id = p_barn_id;
    END IF;

    PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson_type, v_effective_is_late);
  END IF;

  IF v_cascaded THEN
    UPDATE lessons SET cancelled_at = now() WHERE id = p_lesson_id AND barn_id = p_barn_id;
  END IF;

  RETURN v_cascaded;
END;
$$;
