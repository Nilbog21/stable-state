-- Fix trigger to upsert can_instruct rather than skip on conflict.
-- A self-registered trainer creates a pending membership (can_instruct=false default)
-- before first sign-in; the previous ON CONFLICT DO NOTHING left that value in place.
CREATE OR REPLACE FUNCTION public.handle_new_user_role_grant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE email = NEW.email LIMIT 1;
  IF FOUND THEN
    UPDATE public.profiles SET user_id = NEW.id WHERE id = v_profile.id;
    IF v_profile.barn_id IS NOT NULL AND v_profile.role IS NOT NULL THEN
      INSERT INTO public.barn_memberships (user_id, barn_id, role, status, can_instruct)
      VALUES (NEW.id, v_profile.barn_id, v_profile.role, 'active', v_profile.role = 'trainer')
      ON CONFLICT (user_id, barn_id) DO UPDATE SET can_instruct = EXCLUDED.can_instruct;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Targeted function for managers to update can_instruct on a single membership.
-- SECURITY DEFINER so it can update the column directly without a broad RLS UPDATE policy.
CREATE OR REPLACE FUNCTION public.set_can_instruct(p_membership_id uuid, p_barn_id uuid, p_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.set_can_instruct(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_can_instruct(uuid, uuid, boolean) TO authenticated;
