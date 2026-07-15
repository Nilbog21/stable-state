-- #930: 4 column-limiting SECURITY DEFINER relay RPCs
-- (get_instructor_membership_names, get_active_barn_member_summaries,
-- get_lesson_payment_info, get_outstanding_transactions) have no
-- auth.uid() IS NULL bypass in their visibility checks and no service_role
-- EXECUTE grant. A service-role caller (the nightly
-- generate-outstanding-notifications.ts cron today; any future service-role
-- caller of get_outstanding_transactions) hits "permission denied" outright,
-- silently dropping that barn's update via the script's per-barn try/catch.
--
-- Granting service_role EXECUTE without also adding the auth.uid() IS NULL
-- bypass would be worse: the function would run, but every visibility check
-- would still evaluate false (no auth.uid()), silently returning empty rows
-- instead of throwing. Both parts are required together, mirroring the
-- existing IF auth.uid() IS NOT NULL AND NOT ... pattern already used by
-- sync_lesson_transactions / create_agreement_with_first_charge.

CREATE OR REPLACE FUNCTION public.get_instructor_membership_names(p_membership_ids uuid[], p_barn_id uuid)
RETURNS TABLE(id uuid, first_name text, last_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bm.id, p.first_name, p.last_name
  FROM public.barn_memberships bm
  JOIN public.profiles p ON p.id = bm.profile_id
  WHERE bm.id = ANY(p_membership_ids)
    AND bm.barn_id = p_barn_id
    AND (auth.uid() IS NULL OR public.auth_can_read_instructor_membership(bm.id, bm.barn_id));
$$;

GRANT EXECUTE ON FUNCTION public.get_instructor_membership_names(uuid[], uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_active_barn_member_summaries(p_barn_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  profile_id uuid,
  role text,
  can_instruct boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT auth_is_active_barn_member(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT bm.id, bm.user_id, bm.profile_id, bm.role, bm.can_instruct, bm.created_at
  FROM barn_memberships bm
  WHERE bm.barn_id = p_barn_id
    AND bm.status = 'active'
  ORDER BY bm.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_barn_member_summaries(uuid) TO service_role;

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
      auth.uid() IS NULL
      OR public.auth_is_barn_manager(p_barn_id)
      OR public.auth_is_barn_trainer(p_barn_id)
      OR public.auth_is_enrolled_rider(t.lesson_id, p_barn_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_lesson_payment_info(uuid[], uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_outstanding_transactions(
  p_barn_id uuid,
  p_lesson_ids uuid[] DEFAULT '{}',
  p_charge_ids uuid[] DEFAULT '{}',
  p_lesson_rider_ids uuid[] DEFAULT '{}'
) RETURNS TABLE(kind transaction_kind, entity_id uuid, amount numeric, collected boolean, payment_type payment_type_enum)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.kind, t.lesson_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind = 'lesson_fee'
    AND t.barn_id = p_barn_id
    AND t.lesson_id = ANY(p_lesson_ids)
    AND (
      auth.uid() IS NULL
      OR public.auth_is_barn_manager(p_barn_id)
      OR public.auth_is_barn_trainer(p_barn_id)
      OR public.auth_is_enrolled_rider(t.lesson_id, p_barn_id)
    )

  UNION ALL

  SELECT t.kind, t.agreement_charge_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind IN ('lease_charge', 'board_charge')
    AND t.barn_id = p_barn_id
    AND t.agreement_charge_id = ANY(p_charge_ids)
    AND (
      auth.uid() IS NULL
      OR public.auth_is_barn_manager(p_barn_id)
      OR EXISTS (
        SELECT 1 FROM public.agreement_charges ac
        JOIN public.agreements a ON a.id = ac.agreement_id AND a.barn_id = ac.barn_id
        JOIN public.barn_memberships bm ON bm.id = a.rider_id AND bm.barn_id = p_barn_id
        WHERE ac.id = t.agreement_charge_id AND ac.barn_id = p_barn_id
          AND bm.user_id = auth.uid() AND bm.status = 'active'
      )
    )

  UNION ALL

  SELECT t.kind, t.lesson_rider_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind = 'rider_cancellation_fee'
    AND t.barn_id = p_barn_id
    AND t.lesson_rider_id = ANY(p_lesson_rider_ids)
    AND (
      auth.uid() IS NULL
      OR public.auth_is_barn_manager(p_barn_id)
      OR EXISTS (
        SELECT 1 FROM public.lesson_riders lr
        JOIN public.lessons l ON l.id = lr.lesson_id AND l.barn_id = lr.barn_id
        JOIN public.barn_memberships bm ON bm.barn_id = p_barn_id
          AND bm.user_id = auth.uid() AND bm.status = 'active'
          AND (bm.id = lr.rider_id OR (bm.id = l.instructor_id AND public.auth_is_barn_trainer(p_barn_id)))
        WHERE lr.id = t.lesson_rider_id AND lr.barn_id = p_barn_id
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.get_outstanding_transactions(uuid, uuid[], uuid[], uuid[]) TO service_role;
