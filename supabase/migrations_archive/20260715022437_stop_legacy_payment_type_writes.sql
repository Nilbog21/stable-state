-- #885: stop writing lessons.payment_type / agreement_charges.payment_type from
-- every remaining RPC writer, now that get_lesson_payment_info (previous migration)
-- and the DAL read paths (getLessonsByBarn/getLessonById/getChargesForAgreement)
-- read the correct value from the transactions ledger instead. sync_lesson_transactions
-- / sync_rider_cancellation_fee already write the ledger row — these functions'
-- lessons/agreement_charges writes were always redundant with that once #827/#830
-- landed. Column drop itself is left to #831, which also needs to cut Outstanding's
-- reads over before it's safe to drop.
--
-- No signature changes on any of these 7 functions, so all are CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION create_lesson_with_participants(
  p_barn_id uuid, p_instructor_id uuid, p_lesson_at timestamptz, p_fee numeric,
  p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[], p_lesson_type lesson_type,
  p_jumping boolean DEFAULT false, p_tier_name text DEFAULT 'Custom',
  p_payment_type payment_type_enum DEFAULT NULL, p_instructor_cut numeric DEFAULT 0
) RETURNS lessons
LANGUAGE plpgsql
AS $$
DECLARE
  v_lesson         lessons;
  v_rider_count    INT := array_length(p_rider_ids, 1);
  v_instructor_cut numeric;
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  PERFORM assert_lesson_participant_counts(p_lesson_type, array_length(p_horse_ids, 1), v_rider_count);

  v_instructor_cut := COALESCE(
    (SELECT instructor_cut FROM lesson_tiers WHERE barn_id = p_barn_id AND name = p_tier_name LIMIT 1),
    (SELECT default_instructor_cut FROM barns WHERE id = p_barn_id)
  );

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, v_instructor_cut)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id FROM unnest(p_rider_ids) AS r;

  PERFORM sync_lesson_transactions(p_barn_id, v_lesson.id, p_fee, v_instructor_cut, p_instructor_id, p_payment_type, p_lesson_at);

  RETURN v_lesson;
END;
$$;

CREATE OR REPLACE FUNCTION create_lesson_series_with_participants(
  p_barn_id uuid, p_instructor_id uuid, p_lesson_at timestamptz, p_fee numeric,
  p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[], p_lesson_type lesson_type,
  p_jumping boolean DEFAULT false, p_tier_name text DEFAULT 'Custom', p_payment_type payment_type_enum DEFAULT NULL,
  p_instructor_cut numeric DEFAULT 0
) RETURNS lessons
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_series         lesson_series;
  v_lesson         lessons;
  v_rider_count    INT := array_length(p_rider_ids, 1);
  v_instructor_cut numeric;
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  PERFORM assert_lesson_participant_counts(p_lesson_type, array_length(p_horse_ids, 1), v_rider_count);

  v_instructor_cut := COALESCE(
    (SELECT instructor_cut FROM lesson_tiers WHERE barn_id = p_barn_id AND name = p_tier_name LIMIT 1),
    (SELECT default_instructor_cut FROM barns WHERE id = p_barn_id)
  );

  INSERT INTO lesson_series (barn_id, instructor_id, fee, lesson_type, jumping, tier_name, horse_ids, exertion_levels, rider_ids, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_fee, p_lesson_type, p_jumping, p_tier_name, p_horse_ids, p_exertion_levels, p_rider_ids, v_instructor_cut)
  RETURNING * INTO v_series;

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, series_id, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, v_series.id, v_instructor_cut)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id FROM unnest(p_rider_ids) AS r;

  PERFORM sync_lesson_transactions(p_barn_id, v_lesson.id, p_fee, v_instructor_cut, p_instructor_id, p_payment_type, p_lesson_at);

  RETURN v_lesson;
END;
$$;

CREATE OR REPLACE FUNCTION update_lesson_with_participants(
  p_lesson_id uuid, p_barn_id uuid, p_lesson_at timestamptz, p_instructor_id uuid, p_fee numeric,
  p_lesson_type lesson_type, p_jumping boolean, p_payment_type payment_type_enum,
  p_tier_name text, p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[],
  p_instructor_cut numeric DEFAULT 0
) RETURNS lessons
LANGUAGE plpgsql
AS $$
DECLARE
  v_lesson         lessons;
  v_instructor_cut numeric;
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  v_instructor_cut := COALESCE(
    (SELECT instructor_cut FROM lesson_tiers WHERE barn_id = p_barn_id AND name = p_tier_name LIMIT 1),
    (SELECT default_instructor_cut FROM barns WHERE id = p_barn_id)
  );

  UPDATE lessons
  SET lesson_at = p_lesson_at, instructor_id = p_instructor_id, fee = p_fee, lesson_type = p_lesson_type,
      jumping = p_jumping, tier_name = p_tier_name, instructor_cut = v_instructor_cut
  WHERE id = p_lesson_id AND barn_id = p_barn_id
  RETURNING * INTO v_lesson;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lesson not found';
  END IF;

  DELETE FROM lesson_horses WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id;
  INSERT INTO lesson_horses (barn_id, lesson_id, horse_id, exertion_level)
  SELECT p_barn_id, p_lesson_id, unnest(p_horse_ids), unnest(p_exertion_levels);

  DELETE FROM lesson_riders WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id;
  INSERT INTO lesson_riders (barn_id, lesson_id, rider_id)
  SELECT p_barn_id, p_lesson_id, unnest(p_rider_ids);

  PERFORM sync_lesson_transactions(p_barn_id, p_lesson_id, p_fee, v_instructor_cut, p_instructor_id, p_payment_type, p_lesson_at);

  RETURN v_lesson;
END;
$$;

CREATE OR REPLACE FUNCTION generate_lesson_for_series(
  p_series_id uuid, p_barn_id uuid, p_lesson_at timestamptz
) RETURNS lessons
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_series lesson_series;
  v_lesson lessons;
BEGIN
  SELECT * INTO v_series FROM lesson_series WHERE id = p_series_id AND barn_id = p_barn_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'series not found';
  END IF;

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, series_id, instructor_cut)
  VALUES (p_barn_id, v_series.instructor_id, p_lesson_at, v_series.fee, v_series.lesson_type, v_series.jumping, v_series.tier_name, p_series_id, v_series.instructor_cut)
  ON CONFLICT (series_id, lesson_at) DO NOTHING
  RETURNING * INTO v_lesson;

  IF v_lesson.id IS NULL THEN
    SELECT * INTO v_lesson FROM lessons WHERE series_id = p_series_id AND lesson_at = p_lesson_at;
    RETURN v_lesson;
  END IF;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e FROM unnest(v_series.horse_ids, v_series.exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id FROM unnest(v_series.rider_ids) AS r;

  PERFORM sync_lesson_transactions(p_barn_id, v_lesson.id, v_series.fee, v_series.instructor_cut, v_series.instructor_id, NULL, p_lesson_at);

  RETURN v_lesson;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_rider_participation(
  p_lesson_id UUID,
  p_barn_id UUID,
  p_rider_id UUID,
  p_notes TEXT,
  p_is_late BOOLEAN
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_instructor_id UUID;
  v_lesson_cancelled_at TIMESTAMPTZ;
  v_lesson_at TIMESTAMPTZ;
  v_lesson_type lesson_type;
  v_is_self BOOLEAN;
  v_is_instructor BOOLEAN;
  v_effective_is_late BOOLEAN;
  v_updated INT;
  v_remaining_active INT;
  v_cascaded BOOLEAN := false;
BEGIN
  SELECT instructor_id, cancelled_at, lesson_at, lesson_type
  INTO v_instructor_id, v_lesson_cancelled_at, v_lesson_at, v_lesson_type
  FROM lessons WHERE id = p_lesson_id AND barn_id = p_barn_id
  FOR UPDATE;

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
    UPDATE lessons SET fee = 0 WHERE id = p_lesson_id AND barn_id = p_barn_id;
  END IF;

  PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson_type, v_effective_is_late);

  SELECT count(*) INTO v_remaining_active
  FROM lesson_riders
  WHERE lesson_id = p_lesson_id AND barn_id = p_barn_id AND cancelled_at IS NULL;

  IF v_remaining_active = 0 THEN
    UPDATE lessons SET cancelled_at = now() WHERE id = p_lesson_id AND barn_id = p_barn_id;
    v_cascaded := true;
  END IF;

  RETURN v_cascaded;
END;
$$;

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

  PERFORM sync_rider_cancellation_fee(p_barn_id, p_lesson_id, v_lesson.lesson_type, p_is_late);
END;
$$;

-- mark_agreement_charge_paid: stop writing agreement_charges.payment_type (dual-write
-- retired). getChargesForAgreement now overlays payment_type from transactions at
-- read time, so v_charge.payment_type is set from p_payment_type directly before
-- returning, rather than from a column write that would otherwise go stale.
CREATE OR REPLACE FUNCTION mark_agreement_charge_paid(
  p_charge_id    uuid,
  p_barn_id      uuid,
  p_payment_type payment_type_enum
)
RETURNS agreement_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_charge agreement_charges;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_charge FROM agreement_charges WHERE id = p_charge_id AND barn_id = p_barn_id;

  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'charge not found';
  END IF;

  UPDATE transactions
  SET collected = (p_payment_type IS NOT NULL), payment_type = p_payment_type
  WHERE agreement_charge_id = p_charge_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'charge_transaction_not_found';
  END IF;

  v_charge.payment_type := p_payment_type;
  RETURN v_charge;
END;
$$;
