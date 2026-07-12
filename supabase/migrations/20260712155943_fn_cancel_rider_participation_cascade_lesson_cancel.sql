-- Cancelling the only rider on a normal lesson, or the last non-cancelled rider on a
-- group lesson, previously left lessons.cancelled_at untouched, so the whole-lesson
-- "Cancelled" badge never appeared even though every participant was cancelled.
-- Cascade to lessons.cancelled_at when no active riders remain.
CREATE OR REPLACE FUNCTION cancel_rider_participation(
  p_lesson_id UUID,
  p_barn_id UUID,
  p_rider_id UUID,
  p_notes TEXT,
  p_is_late BOOLEAN
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_instructor_id UUID;
  v_lesson_cancelled_at TIMESTAMPTZ;
  v_lesson_at TIMESTAMPTZ;
  v_is_self BOOLEAN;
  v_is_instructor BOOLEAN;
  v_effective_is_late BOOLEAN;
  v_updated INT;
  v_remaining_active INT;
BEGIN
  SELECT instructor_id, cancelled_at, lesson_at INTO v_instructor_id, v_lesson_cancelled_at, v_lesson_at
  FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id;

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

  SELECT count(*) INTO v_remaining_active
  FROM lesson_riders
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND cancelled_at IS NULL;

  IF v_remaining_active = 0 THEN
    UPDATE lessons SET cancelled_at = now() WHERE id = p_lesson_id AND barn_id = p_barn_id;
  END IF;
END;
$$;
