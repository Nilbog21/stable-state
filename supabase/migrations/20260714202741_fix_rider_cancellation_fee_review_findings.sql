-- #830 review follow-up: sync_rider_cancellation_fee's original auth check
-- (auth_is_active_barn_member) let ANY active barn member call it directly for an
-- arbitrary lesson, since transactions writes are gated solely by this RPC's own
-- check (INSERT/UPDATE/DELETE are revoked from `authenticated` on that table). The
-- barn-membership-only check was copied from sync_lesson_transactions, but that
-- analogy doesn't hold: sync_lesson_transactions mirrors lessons_insert RLS, which
-- already lets any active member create their own lesson. Cancellation has no such
-- RLS equivalent -- only a manager, the lesson's instructing trainer, or the
-- affected rider may legitimately trigger it. This replaces the check with the same
-- manager/instructing-trainer/self shape cancel_rider_participation and
-- cancel_lesson_with_transactions already enforce before PERFORMing this helper,
-- resolved by looking up the lesson's instructor and its enrolled rider directly,
-- since this helper doesn't receive either as a parameter.
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
