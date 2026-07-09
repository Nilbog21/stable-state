-- Add can_instruct flag to barn_memberships.
-- Trainers are instructors by definition; managers default to false.

ALTER TABLE public.barn_memberships
  ADD COLUMN can_instruct BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing trainer memberships.
UPDATE public.barn_memberships SET can_instruct = true WHERE role = 'trainer';

-- Update trigger so new sign-ins propagate can_instruct correctly.
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
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
