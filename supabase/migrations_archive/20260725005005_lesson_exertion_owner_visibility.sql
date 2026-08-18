-- #999: get_lesson_horse_exertion_levels gains a privileged-rider branch,
-- mirroring what #997 already did for get_horse_projected_exhaustion. Replaces
-- the manager/trainer-only RAISE EXCEPTION with a row-level filter, so a
-- rider only ever sees exertion for a horse they hold lesson_read_privileges
-- for -- not the whole lesson's horses. CREATE OR REPLACE keeps the function's
-- existing GRANT EXECUTE ... TO authenticated (release3_rls.sql), which
-- CREATE OR REPLACE never resets.
CREATE OR REPLACE FUNCTION public.get_lesson_horse_exertion_levels(p_lesson_id uuid, p_barn_id uuid)
RETURNS TABLE (horse_id uuid, exertion_level smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT lh.horse_id, lh.exertion_level
  FROM lesson_horses lh
  WHERE lh.lesson_id = p_lesson_id AND lh.barn_id = p_barn_id
    AND (
      auth_is_barn_manager(p_barn_id)
      OR auth_is_barn_trainer(p_barn_id)
      OR auth_has_horse_lesson_read_privilege(lh.horse_id, p_barn_id)
    );
END;
$$;
