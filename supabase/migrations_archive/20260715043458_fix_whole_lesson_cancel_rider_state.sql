-- #831 manual-verification follow-up: cancel_lesson_with_transactions (the
-- whole-lesson cancel path reached from /barn/[slug]/lessons/[id]/cancel) set
-- lessons.cancelled_at but never lesson_riders.cancelled_at -- only the
-- per-rider cancel-rider RPC (cancel_rider_participation) wrote that column.
-- For a normal lesson this meant sync_rider_cancellation_fee still correctly
-- created an uncollected rider_cancellation_fee transaction on a late
-- whole-lesson cancel, but getOutstandingCancellationFeeRows' candidate query
-- (lesson_riders.cancelled_at IS NOT NULL) never found the row, so the fee
-- was invisible on Outstanding with no way to mark it paid through the UI.
-- Fixed by also marking every still-active lesson_riders row cancelled here --
-- for a normal lesson (exactly 1 rider) this is the same event as cancelling
-- the lesson itself, per ARCHITECTURE.md; for a group lesson this path is only
-- reachable via "Cancelled by Instructor" (whole lesson, all riders), so the
-- same reasoning applies there too. Harmless for any rider already
-- individually cancelled (cancelled_at IS NULL guard keeps this idempotent
-- and non-clobbering of their own earlier cancelled_at/cancellation_notes).
CREATE OR REPLACE FUNCTION public.cancel_lesson_with_transactions(
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
      fee = CASE WHEN p_is_late THEN fee ELSE 0 END
  WHERE id = p_lesson_id AND barn_id = p_barn_id;

  UPDATE lesson_riders
  SET cancelled_at = now(),
      cancellation_notes = p_notes
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND cancelled_at IS NULL;

  PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson.lesson_type, p_is_late);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_lesson_with_transactions(uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_lesson_with_transactions(uuid, uuid, text, boolean) TO authenticated;
