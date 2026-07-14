-- #827: wire lesson fee + instructor payout into the transactions ledger (#826).
--
-- sync_lesson_transactions is a SECURITY DEFINER sub-call PERFORMed from the existing
-- SECURITY INVOKER lesson-writing functions below, since `transactions` has no direct
-- INSERT/UPDATE/DELETE grant to `authenticated` (see rls_transactions.sql). None of those
-- functions' signatures change, so this is CREATE OR REPLACE, not DROP + CREATE.
--
-- A $0 fee is auto-collected regardless of p_payment_type, matching #769's existing
-- "no payment type required for a $0 lesson" UX. An instructor_payout row is still
-- created whenever collected (even at $0 fee, even if the cut is 0) so a comped lesson's
-- negative net (fee 0, cut still owed) is representable, matching the existing
-- "comped lesson" example already documented for Finances' negative-net rendering.
--
-- The two partial unique indexes make this idempotent (ON CONFLICT), mirroring the
-- ON CONFLICT (agreement_id, period) / (series_id, lesson_at) idiom already used by
-- generate_agreement_charge / generate_lesson_for_series.
CREATE UNIQUE INDEX transactions_lesson_fee_key
  ON public.transactions (lesson_id) WHERE kind = 'lesson_fee';
CREATE UNIQUE INDEX transactions_instructor_payout_key
  ON public.transactions (lesson_id) WHERE kind = 'instructor_payout';

CREATE FUNCTION public.sync_lesson_transactions(
  p_barn_id uuid, p_lesson_id uuid, p_fee numeric, p_instructor_cut numeric,
  p_instructor_id uuid, p_payment_type payment_type_enum, p_occurred_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_collected boolean := (p_fee = 0) OR (p_payment_type IS NOT NULL);
BEGIN
  INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, occurred_at, lesson_id)
  VALUES (p_barn_id, 'lesson_fee', p_fee, v_collected, p_payment_type, p_occurred_at, p_lesson_id)
  ON CONFLICT (lesson_id) WHERE kind = 'lesson_fee'
  DO UPDATE SET amount = EXCLUDED.amount, collected = EXCLUDED.collected,
    payment_type = EXCLUDED.payment_type, occurred_at = EXCLUDED.occurred_at;

  IF v_collected THEN
    INSERT INTO transactions (barn_id, kind, amount, collected, payment_type, membership_id, occurred_at, lesson_id)
    VALUES (p_barn_id, 'instructor_payout', -p_instructor_cut, true, p_payment_type, p_instructor_id, p_occurred_at, p_lesson_id)
    ON CONFLICT (lesson_id) WHERE kind = 'instructor_payout'
    DO UPDATE SET amount = EXCLUDED.amount, payment_type = EXCLUDED.payment_type,
      membership_id = EXCLUDED.membership_id, occurred_at = EXCLUDED.occurred_at;
  ELSE
    DELETE FROM transactions WHERE lesson_id = p_lesson_id AND kind = 'instructor_payout';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_lesson_transactions(uuid, uuid, numeric, numeric, uuid, payment_type_enum, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_lesson_transactions(uuid, uuid, numeric, numeric, uuid, payment_type_enum, timestamptz) TO authenticated;

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

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, p_payment_type, v_instructor_cut)
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

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type, series_id, instructor_cut)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, p_payment_type, v_series.id, v_instructor_cut)
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
      jumping = p_jumping, payment_type = p_payment_type, tier_name = p_tier_name, instructor_cut = v_instructor_cut
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

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type, series_id, instructor_cut)
  VALUES (p_barn_id, v_series.instructor_id, p_lesson_at, v_series.fee, v_series.lesson_type, v_series.jumping, v_series.tier_name, NULL, p_series_id, v_series.instructor_cut)
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
