-- #885: get_lesson_payment_info relays payment_type from the transactions ledger
-- (the real source of truth since #827) to callers who previously read
-- lessons.payment_type directly. Column-limiting SECURITY DEFINER function,
-- mirroring get_horse_projected_exhaustion/get_instructor_membership_names —
-- avoids widening transactions RLS to trainer/rider, which would also expose
-- that lesson's instructor_payout row (same lesson_id, different kind).
--
-- Scoping matches the existing lessons_select_staff/lessons_select_rider RLS
-- split: manager and trainer both see any barn lesson's payment_type
-- (trainers currently have barn-wide lesson visibility, not just their own —
-- see lessons_select_staff), rider only sees lessons they're enrolled in.
CREATE OR REPLACE FUNCTION public.get_lesson_payment_info(p_lesson_ids uuid[], p_barn_id uuid)
RETURNS TABLE(lesson_id uuid, payment_type payment_type_enum)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.lesson_id, t.payment_type
  FROM public.transactions t
  WHERE t.kind = 'lesson_fee'
    AND t.barn_id = p_barn_id
    AND t.lesson_id = ANY(p_lesson_ids)
    AND (
      public.auth_is_barn_manager(p_barn_id)
      OR public.auth_is_barn_trainer(p_barn_id)
      OR public.auth_is_enrolled_rider(t.lesson_id, p_barn_id)
    );
$$;

REVOKE ALL ON FUNCTION public.get_lesson_payment_info(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_lesson_payment_info(uuid[], uuid) TO authenticated;
