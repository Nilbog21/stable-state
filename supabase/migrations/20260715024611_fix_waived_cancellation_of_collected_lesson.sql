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
CREATE OR REPLACE FUNCTION public.sync_rider_cancellation_fee(
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
