-- Consolidated baseline (#657): functions, RPCs, and triggers.
-- See 20260629004610_baseline_schema.sql for context.

CREATE FUNCTION public.auth_get_profile_immutable_fields(p_id uuid) RETURNS TABLE(user_id uuid, email text, first_name text, last_name text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT user_id, email, first_name, last_name, created_at
  FROM public.profiles WHERE id = p_id;
$$;

CREATE FUNCTION public.auth_is_any_barn_manager() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid()
      AND role = 'manager'
      AND status = 'active'
  );
$$;

CREATE FUNCTION public.auth_is_barn_manager(p_barn_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid()
      AND barn_id = p_barn_id
      AND status = 'active'
      AND role = 'manager'
  );
$$;

CREATE FUNCTION public.auth_is_barn_trainer(p_barn_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid()
      AND barn_id = p_barn_id
      AND status = 'active'
      AND role = 'trainer'
  );
$$;

CREATE FUNCTION public.claim_managed_member(p_token uuid, p_user_id uuid, p_email text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_profile_id UUID;
  v_membership_id UUID;
BEGIN
  SELECT id, profile_id
    INTO v_membership_id, v_profile_id
  FROM barn_memberships
  WHERE invite_token = p_token;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'token_not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = v_profile_id AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'user_already_claimed';
  END IF;

  UPDATE profiles
    SET user_id = p_user_id, email = p_email, is_managed = false
  WHERE id = v_profile_id;

  UPDATE barn_memberships
    SET user_id = p_user_id, invite_token = NULL
  WHERE id = v_membership_id;
END;
$$;

CREATE FUNCTION public.create_lesson_with_participants(p_barn_id uuid, p_instructor_id uuid, p_lesson_at timestamp with time zone, p_fee numeric, p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[], p_lesson_type public.lesson_type, p_jumping boolean DEFAULT false, p_tier_name text DEFAULT 'Custom'::text, p_payment_type public.payment_type_enum DEFAULT NULL::public.payment_type_enum) RETURNS public.lessons
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_lesson      lessons;
  v_rider_count INT := array_length(p_rider_ids, 1);
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  IF v_rider_count IS NULL THEN
    RAISE EXCEPTION 'at least one rider is required';
  END IF;

  IF p_lesson_type = 'normal' AND v_rider_count <> 1 THEN
    RAISE EXCEPTION 'Normal lesson must have exactly 1 rider (got %)', v_rider_count;
  END IF;

  IF p_lesson_type = 'normal' AND array_length(p_horse_ids, 1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Normal lesson must have exactly 1 horse (got %)', COALESCE(array_length(p_horse_ids, 1), 0);
  END IF;

  IF p_lesson_type = 'group' AND v_rider_count < 2 THEN
    RAISE EXCEPTION 'Group lesson must have at least 2 riders (got %)', v_rider_count;
  END IF;

  INSERT INTO lessons (barn_id, instructor_id, lesson_at, fee, lesson_type, jumping, tier_name, payment_type)
  VALUES (p_barn_id, p_instructor_id, p_lesson_at, p_fee, p_lesson_type, p_jumping, p_tier_name, p_payment_type)
  RETURNING * INTO v_lesson;

  INSERT INTO lesson_horses (lesson_id, horse_id, barn_id, exertion_level)
  SELECT v_lesson.id, h, p_barn_id, e
  FROM unnest(p_horse_ids, p_exertion_levels) AS t(h, e);

  INSERT INTO lesson_riders (lesson_id, rider_id, barn_id)
  SELECT v_lesson.id, r, p_barn_id
  FROM unnest(p_rider_ids) AS r;

  RETURN v_lesson;
END;
$$;

CREATE FUNCTION public.create_managed_member(p_barn_id uuid, p_first_name text, p_last_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_profile_id UUID;
  v_membership_id UUID;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  INSERT INTO profiles (first_name, last_name, is_managed)
    VALUES (p_first_name, p_last_name, true)
    RETURNING id INTO v_profile_id;

  INSERT INTO barn_memberships (barn_id, profile_id, role, status, invite_token)
    VALUES (p_barn_id, v_profile_id, 'rider', 'active', gen_random_uuid())
    RETURNING id INTO v_membership_id;

  RETURN v_membership_id;
END;
$$;

CREATE FUNCTION public.enforce_lesson_participant_counts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_lesson_id   UUID;
  v_lesson_type lesson_type;
  v_rider_count INT;
  v_horse_count INT;
BEGIN
  v_lesson_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.lesson_id ELSE NEW.lesson_id END;

  SELECT l.lesson_type INTO v_lesson_type FROM lessons l WHERE l.id = v_lesson_id;

  -- lesson was cascade-deleted in this transaction; nothing to enforce
  IF v_lesson_type IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_rider_count FROM lesson_riders WHERE lesson_id = v_lesson_id;
  SELECT COUNT(*) INTO v_horse_count FROM lesson_horses WHERE lesson_id = v_lesson_id;

  IF v_lesson_type = 'normal' THEN
    IF v_rider_count <> 1 THEN
      RAISE EXCEPTION 'Normal lesson must have exactly 1 rider (found %)', v_rider_count;
    END IF;
    IF v_horse_count <> 1 THEN
      RAISE EXCEPTION 'Normal lesson must have exactly 1 horse (found %)', v_horse_count;
    END IF;
  ELSIF v_lesson_type = 'group' THEN
    IF v_rider_count < 2 THEN
      RAISE EXCEPTION 'Group lesson must have at least 2 riders (found %)', v_rider_count;
    END IF;
    IF v_horse_count < 1 THEN
      RAISE EXCEPTION 'Group lesson must have at least 1 horse (found %)', v_horse_count;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE FUNCTION public.get_horse_exertion_summary(p_barn_id uuid, p_since timestamp with time zone) RETURNS TABLE(id uuid, name text, is_active boolean, is_available boolean, unavailability_reason text, lesson_count bigint, total_exertion bigint, jumping_count bigint)
    LANGUAGE sql STABLE
    AS $$
  SELECT
    h.id,
    h.name,
    h.is_active,
    h.is_available,
    h.unavailability_reason,
    COALESCE(agg.lesson_count, 0)    AS lesson_count,
    COALESCE(agg.total_exertion, 0)  AS total_exertion,
    COALESCE(agg.jumping_count, 0)   AS jumping_count
  FROM horses h
  LEFT JOIN (
    SELECT
      lh.horse_id,
      COUNT(lh.lesson_id)::bigint                   AS lesson_count,
      SUM(lh.exertion_level)::bigint                AS total_exertion,
      COUNT(CASE WHEN l.jumping THEN 1 END)::bigint AS jumping_count
    FROM lesson_horses lh
    JOIN lessons l ON l.id = lh.lesson_id
                   AND l.barn_id = p_barn_id
                   AND l.lesson_at >= p_since
    WHERE lh.barn_id = p_barn_id
    GROUP BY lh.horse_id
  ) agg ON agg.horse_id = h.id
  WHERE h.barn_id = p_barn_id
  ORDER BY h.name;
$$;

CREATE FUNCTION public.set_can_instruct(p_membership_id uuid, p_barn_id uuid, p_value boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.barn_memberships
  SET can_instruct = p_value
  WHERE id = p_membership_id AND barn_id = p_barn_id;
END;
$$;

CREATE FUNCTION public.set_default_tier(p_tier_id uuid, p_barn_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE lesson_tiers SET is_default = false WHERE barn_id = p_barn_id;
  UPDATE lesson_tiers SET is_default = true WHERE id = p_tier_id AND barn_id = p_barn_id;
END;
$$;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.teardown_all_lesson_data() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM lesson_riders WHERE TRUE;
  DELETE FROM lesson_horses WHERE TRUE;
  DELETE FROM lessons WHERE TRUE;
END;
$$;

CREATE FUNCTION public.teardown_dev_barn_lessons(p_barn_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM lesson_riders WHERE barn_id = p_barn_id;
  DELETE FROM lesson_horses WHERE barn_id = p_barn_id;
  DELETE FROM lessons WHERE barn_id = p_barn_id;
END;
$$;

CREATE FUNCTION public.update_lesson_with_participants(p_lesson_id uuid, p_barn_id uuid, p_lesson_at timestamp with time zone, p_instructor_id uuid, p_fee numeric, p_lesson_type public.lesson_type, p_jumping boolean, p_payment_type public.payment_type_enum, p_tier_name text, p_horse_ids uuid[], p_exertion_levels integer[], p_rider_ids uuid[]) RETURNS public.lessons
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_lesson lessons;
BEGIN
  IF array_length(p_horse_ids, 1) IS DISTINCT FROM array_length(p_exertion_levels, 1) THEN
    RAISE EXCEPTION 'p_horse_ids and p_exertion_levels must have equal length';
  END IF;

  UPDATE lessons
  SET
    lesson_at     = p_lesson_at,
    instructor_id = p_instructor_id,
    fee           = p_fee,
    lesson_type   = p_lesson_type,
    jumping       = p_jumping,
    payment_type  = p_payment_type,
    tier_name     = p_tier_name
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

  RETURN v_lesson;
END;
$$;

CREATE TRIGGER horse_documents_set_updated_at BEFORE UPDATE ON public.horse_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER horses_set_updated_at BEFORE UPDATE ON public.horses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE CONSTRAINT TRIGGER lesson_horses_participant_count_check AFTER INSERT OR DELETE OR UPDATE ON public.lesson_horses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_lesson_participant_counts();

CREATE CONSTRAINT TRIGGER lesson_riders_participant_count_check AFTER INSERT OR DELETE OR UPDATE ON public.lesson_riders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_lesson_participant_counts();

CREATE TRIGGER rider_documents_set_updated_at BEFORE UPDATE ON public.rider_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trainer_documents_set_updated_at BEFORE UPDATE ON public.trainer_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
