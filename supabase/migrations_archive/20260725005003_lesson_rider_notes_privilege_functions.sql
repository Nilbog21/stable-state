-- #999 review follow-up: lesson_riders has a table-wide GRANT SELECT to
-- authenticated and its RLS policies (lesson_riders_select_staff/_select_rider/
-- _select_horse_privilege) are row-level only, so getLessonById's app-layer
-- masking of rider_notes/private_notes (select-string trimming + post-query
-- nulling) can't stop a caller with row visibility from reading every rider's
-- notes directly via PostgREST. Same fix shape as get_lesson_horse_exertion_levels
-- (#937/#999): the table-wide grant is revoked and re-granted minus these two
-- columns (companion RLS migration), making this RPC the only way to read them.
CREATE FUNCTION public.get_lesson_rider_notes(p_lesson_id uuid, p_barn_id uuid)
RETURNS TABLE (rider_id uuid, rider_notes text, private_notes text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lr.rider_id,
    CASE
      WHEN auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id) THEN lr.rider_notes
      WHEN lr.rider_id = (
        SELECT bm.id FROM barn_memberships bm
        WHERE bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
      ) THEN lr.rider_notes
      ELSE NULL
    END,
    CASE
      WHEN auth_is_barn_manager(p_barn_id) OR auth_is_barn_trainer(p_barn_id) THEN lr.private_notes
      ELSE NULL
    END
  FROM lesson_riders lr
  WHERE lr.lesson_id = p_lesson_id AND lr.barn_id = p_barn_id
    AND (
      auth_is_barn_manager(p_barn_id)
      OR auth_is_barn_trainer(p_barn_id)
      OR auth_is_enrolled_rider(p_lesson_id, p_barn_id)
      OR auth_lesson_has_privileged_horse(p_lesson_id, p_barn_id)
    );
END;
$$;
