-- #1641: close the DELETE-then-INSERT route around the `profiles.is_demo` pin.
--
-- `20260818001939_demo_profile_flag_rls.sql` pinned the column in `profiles_own_update`'s WITH
-- CHECK, which stops the demo session *editing* its flag away — but `profiles_own_delete` carried
-- no constraint at all, so the same anon-key session could take the row out and put a fresh one
-- back with `is_demo` at its `false` default. `barn_memberships_write_own` has no `FOR` clause, so
-- it is `FOR ALL` and the demo session can clear the `barn_memberships.profile_id` references
-- first (that FK has no CASCADE), which is what made the chain reachable rather than blocked by a
-- constraint error.
--
-- ponytail: the DELETE is the only half that needs closing. `profiles_user_id_unique` means the
-- replacement row cannot be inserted while the original is still there, so `profiles_own_insert`
-- stays as it is and `barn_memberships_write_own` keeps its `FOR ALL` breadth — a member removing
-- themselves from a barn is a supported thing to do, and it is only load-bearing here as a step
-- towards the profile delete this policy now refuses.
--
-- No helper function, unlike the UPDATE pin: a DELETE policy's USING reads the row being deleted,
-- so naming the column directly neither recurses nor needs a SECURITY DEFINER old-row read.
DROP POLICY profiles_own_delete ON public.profiles;
CREATE POLICY profiles_own_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND is_demo IS NOT TRUE);
