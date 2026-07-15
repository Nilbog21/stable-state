-- #831: Outstanding cutover. transactions SELECT is manager-only RLS, so a
-- trainer/rider-facing Outstanding read needs a SECURITY DEFINER relay, same
-- column-limiting pattern as get_lesson_payment_info. The DAL already resolves
-- its candidate lesson/charge/lesson_rider IDs via plain RLS-scoped queries
-- (lessons, agreement_charges, lesson_riders all already role-scope correctly)
-- — this function just relays collected/payment_type/amount from transactions
-- for exactly those IDs, re-checking visibility per row.
--
-- One UNION ALL of three branches instead of three separate functions, since
-- the issue asks for a single get_outstanding_transactions RPC covering all
-- three ledger kinds Outstanding cares about.
CREATE FUNCTION public.get_outstanding_transactions(
  p_barn_id uuid,
  p_lesson_ids uuid[] DEFAULT '{}',
  p_charge_ids uuid[] DEFAULT '{}',
  p_lesson_rider_ids uuid[] DEFAULT '{}'
) RETURNS TABLE(kind transaction_kind, entity_id uuid, amount numeric, collected boolean, payment_type payment_type_enum)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- lesson_fee: manager (barn-wide), trainer (barn-wide, matches lessons_select_staff),
  -- or the enrolled rider — same visibility as get_lesson_payment_info.
  SELECT t.kind, t.lesson_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind = 'lesson_fee'
    AND t.barn_id = p_barn_id
    AND t.lesson_id = ANY(p_lesson_ids)
    AND (
      public.auth_is_barn_manager(p_barn_id)
      OR public.auth_is_barn_trainer(p_barn_id)
      OR public.auth_is_enrolled_rider(t.lesson_id, p_barn_id)
    )

  UNION ALL

  -- lease_charge/board_charge: manager, or the rider party to the parent agreement
  -- (matches agreement_charges'/agreements' own RLS — trainers are never a party).
  SELECT t.kind, t.agreement_charge_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind IN ('lease_charge', 'board_charge')
    AND t.barn_id = p_barn_id
    AND t.agreement_charge_id = ANY(p_charge_ids)
    AND (
      public.auth_is_barn_manager(p_barn_id)
      OR EXISTS (
        SELECT 1 FROM public.agreement_charges ac
        JOIN public.agreements a ON a.id = ac.agreement_id AND a.barn_id = ac.barn_id
        JOIN public.barn_memberships bm ON bm.id = a.rider_id AND bm.barn_id = p_barn_id
        WHERE ac.id = t.agreement_charge_id AND ac.barn_id = p_barn_id
          AND bm.user_id = auth.uid() AND bm.status = 'active'
      )
    )

  UNION ALL

  -- rider_cancellation_fee: manager, the instructing trainer, or the cancelled rider
  -- themself — mirrors cancel_rider_participation's own manager/instructor/self shape.
  SELECT t.kind, t.lesson_rider_id, t.amount, t.collected, t.payment_type
  FROM public.transactions t
  WHERE t.kind = 'rider_cancellation_fee'
    AND t.barn_id = p_barn_id
    AND t.lesson_rider_id = ANY(p_lesson_rider_ids)
    AND (
      public.auth_is_barn_manager(p_barn_id)
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

REVOKE ALL ON FUNCTION public.get_outstanding_transactions(uuid, uuid[], uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outstanding_transactions(uuid, uuid[], uuid[], uuid[]) TO authenticated;

-- collect_rider_cancellation_fee: manager-only mark-paid/revert for a
-- rider_cancellation_fee transaction, mirroring mark_agreement_charge_paid's shape.
-- Not tied to a lessons.id the existing collect_lesson_payment could reuse, since
-- this transaction is keyed on lesson_rider_id (see sync_rider_cancellation_fee).
CREATE FUNCTION public.collect_rider_cancellation_fee(
  p_lesson_rider_id uuid, p_barn_id uuid, p_payment_type payment_type_enum
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE transactions
  SET collected = (p_payment_type IS NOT NULL), payment_type = p_payment_type
  WHERE lesson_rider_id = p_lesson_rider_id AND barn_id = p_barn_id AND kind = 'rider_cancellation_fee';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancellation_fee_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.collect_rider_cancellation_fee(uuid, uuid, payment_type_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collect_rider_cancellation_fee(uuid, uuid, payment_type_enum) TO authenticated;
