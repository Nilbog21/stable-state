-- set_can_instruct only verified the caller's manager status, not the target row's role. EXECUTE
-- is granted broadly to authenticated, so a direct RPC call (bypassing setCanInstructAction's own
-- app-level role gate) could flip can_instruct=true on a rider's membership; getInstructorsByBarn
-- has no role filter, so that rider would then surface in the lesson-instructor picker. Reject
-- non-manager/trainer targets inline, so authorization no longer depends on the calling app.
CREATE OR REPLACE FUNCTION public.set_can_instruct(p_membership_id uuid, p_barn_id uuid, p_value boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_target_role TEXT;
BEGIN
  IF NOT auth_is_barn_manager(p_barn_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT role INTO v_target_role
  FROM public.barn_memberships
  WHERE id = p_membership_id AND barn_id = p_barn_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found';
  END IF;

  IF v_target_role NOT IN ('manager', 'trainer') THEN
    RAISE EXCEPTION 'invalid_target_role';
  END IF;

  UPDATE public.barn_memberships
  SET can_instruct = p_value
  WHERE id = p_membership_id AND barn_id = p_barn_id;
END;
$$;
