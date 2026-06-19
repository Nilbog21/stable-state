-- Drop the broad UPDATE policy added in 20260620000001.
-- Authorization for can_instruct updates is now enforced inside set_can_instruct(),
-- which is SECURITY DEFINER and updates only that column.
DROP POLICY IF EXISTS "managers can update can_instruct for barn members" ON public.barn_memberships;
