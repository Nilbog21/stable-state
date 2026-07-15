-- #831: sync_rider_cancellation_fee left an already-collected lesson_fee
-- transaction untouched on a *waived* cancellation, relying on the legacy
-- lessons.fee column (force-zeroed by the same caller) to keep it out of
-- income totals. Harmless while every reader also gated on fee !== 0, but
-- lesson-finances.ts's income functions already read `transactions` (#827) —
-- so a waived cancellation of an already-collected lesson is still counted as
-- collected income today. Same signature, so CREATE OR REPLACE.
--
-- When the initial DELETE (WHERE collected = false) finds nothing because the
-- row is already collected, and the cancellation is waived (not late), clear
-- that row instead of leaving it: amount = 0, payment_type = NULL,
-- collected = true — mirrors sync_lesson_transactions' own "$0 fee is always
-- auto-collected" convention. Late-and-collected (fee legitimately kept) and
-- waived-and-uncollected (existing delete path) are unaffected.
--
-- Review fix: this CREATE OR REPLACE must keep the manager/instructing-trainer/
-- enrolled-rider auth check from 20260714202741_fix_rider_cancellation_fee_review_findings.sql
-- (a #830 review follow-up) — a plain auth_is_active_barn_member check lets ANY
-- active barn member manipulate an arbitrary lesson's transactions ledger, since
-- transactions writes are gated solely by this function's own check.
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

  IF p_lesson_type <> 'normal' THEN
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
    -- A normal lesson always has exactly 1 rider (assert_lesson_participant_counts).
    SELECT id INTO v_lesson_rider_id FROM lesson_riders WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id LIMIT 1;

    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, lesson_rider_id, occurred_at)
    VALUES (p_barn_id, 'rider_cancellation_fee', v_fee_txn.amount, false, NULL, v_lesson_rider_id, v_fee_txn.occurred_at);
  END IF;
END;
$$;
