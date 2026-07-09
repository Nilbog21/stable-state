-- Managers can update can_instruct for any member in their barn.
CREATE POLICY "managers can update can_instruct for barn members"
  ON public.barn_memberships
  FOR UPDATE
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));
