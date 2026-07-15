-- Cancels a single rider's participation in a lesson. SECURITY DEFINER because
-- lesson_riders RLS grants riders only SELECT+INSERT (no UPDATE) -- this function
-- is the sole write path and does its own inline authorization check.
-- Authorized callers: barn manager, the trainer instructing this lesson, or the
-- rider themself (self-cancel), resolved via barn_memberships.user_id = auth.uid()
-- since lesson_riders.rider_id is a membership id, not an auth user id.
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
  v_is_self BOOLEAN;
  v_updated INT;
BEGIN
  SELECT instructor_id, cancelled_at INTO v_instructor_id, v_lesson_cancelled_at
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

  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR (auth_is_barn_trainer(p_barn_id) AND v_instructor_id = auth.uid())
    OR v_is_self
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE lesson_riders
  SET cancelled_at = now(), rider_notes = p_notes
  WHERE lesson_id = p_lesson_id AND rider_id = p_rider_id AND barn_id = p_barn_id
    AND cancelled_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'rider_not_found_or_already_cancelled';
  END IF;

  IF NOT p_is_late THEN
    UPDATE lessons SET fee = 0, payment_type = NULL WHERE id = p_lesson_id AND barn_id = p_barn_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_rider_participation(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_rider_participation(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated;
