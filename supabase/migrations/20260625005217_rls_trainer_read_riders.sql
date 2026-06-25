-- Allow active trainers to read active rider memberships in their barn.
-- Uses SECURITY DEFINER to avoid infinite recursion (same pattern as auth_is_barn_manager).

CREATE OR REPLACE FUNCTION auth_is_barn_trainer(p_barn_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM barn_memberships
    WHERE user_id = auth.uid()
      AND barn_id = p_barn_id
      AND status = 'active'
      AND role = 'trainer'
  );
$$;

CREATE POLICY "barn_memberships_trainer_read_riders" ON public.barn_memberships
  FOR SELECT TO authenticated
  USING (
    role = 'rider'
    AND status = 'active'
    AND auth_is_barn_trainer(barn_memberships.barn_id)
  );
