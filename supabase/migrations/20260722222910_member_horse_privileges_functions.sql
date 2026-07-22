-- #997: SECURITY DEFINER helpers checking the caller's own
-- member_horse_privileges row for a given horse, mirroring
-- auth_is_enrolled_rider's recursion-safe pattern (a plain subquery from a
-- policy on the same/related table risks infinite recursion).

CREATE FUNCTION public.auth_get_horse_document_privilege(p_horse_id uuid, p_barn_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT mhp.document_privileges
     FROM public.barn_memberships bm
     JOIN public.member_horse_privileges mhp
       ON mhp.member_id = bm.id AND mhp.horse_id = p_horse_id AND mhp.barn_id = p_barn_id
     WHERE bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
     LIMIT 1),
    'none'
  );
$$;

CREATE FUNCTION public.auth_has_horse_lesson_read_privilege(p_horse_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.barn_memberships bm
    JOIN public.member_horse_privileges mhp ON mhp.member_id = bm.id
    WHERE bm.user_id = auth.uid() AND bm.barn_id = p_barn_id AND bm.status = 'active'
      AND mhp.horse_id = p_horse_id AND mhp.barn_id = p_barn_id
      AND mhp.lesson_read_privileges = true
  );
$$;

-- #997: fully encapsulates the lessons/lesson_riders → lesson_horses join
-- inside a single SECURITY DEFINER function, mirroring auth_is_enrolled_rider
-- rather than leaving an inline cross-table subquery in the RLS policy
-- itself — keeps the same recursion-safety guarantee if a future migration
-- ever adds a lesson_horses policy that references lessons/lesson_riders.
CREATE FUNCTION public.auth_lesson_has_privileged_horse(p_lesson_id uuid, p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lesson_horses lh
    WHERE lh.lesson_id = p_lesson_id AND lh.barn_id = p_barn_id
      AND public.auth_has_horse_lesson_read_privilege(lh.horse_id, p_barn_id)
  );
$$;

-- #997: get_horse_projected_exhaustion gains a third authorization branch —
-- a rider with lesson_read_privileges=true for this specific horse. Same
-- signature/body otherwise; get_horse_exertion_summary (barn-wide) is
-- untouched and stays manager/trainer-only.
CREATE OR REPLACE FUNCTION public.get_horse_projected_exhaustion(
  p_horse_id UUID,
  p_barn_id UUID,
  p_target_date TIMESTAMPTZ,
  p_exclude_lesson_id UUID DEFAULT NULL
)
RETURNS TABLE (lesson_at TIMESTAMPTZ, exertion_level SMALLINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    auth_is_barn_manager(p_barn_id)
    OR auth_is_barn_trainer(p_barn_id)
    OR auth_has_horse_lesson_read_privilege(p_horse_id, p_barn_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT l.lesson_at, lh.exertion_level
  FROM lesson_horses lh
  JOIN lessons l ON l.id = lh.lesson_id AND l.barn_id = p_barn_id
  WHERE lh.horse_id = p_horse_id
    AND lh.barn_id = p_barn_id
    AND l.cancelled_at IS NULL
    AND l.lesson_at BETWEEN p_target_date - INTERVAL '3 days' AND p_target_date + INTERVAL '3 days'
    AND (p_exclude_lesson_id IS NULL OR l.id <> p_exclude_lesson_id);
END;
$$;
