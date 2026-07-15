-- Targeted function for managers to update instructor_cut on their barn.
-- SECURITY DEFINER so it can update the column directly without a broad RLS UPDATE policy.
CREATE OR REPLACE FUNCTION public.set_instructor_cut(p_barn_id uuid, p_value numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.barns
  SET instructor_cut = p_value
  WHERE id = p_barn_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_instructor_cut(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_instructor_cut(uuid, numeric) TO authenticated;
