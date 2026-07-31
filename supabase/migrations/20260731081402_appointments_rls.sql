-- #1148 RLS half (see the ..._appointments_split.sql companion for the rationale).
--
-- The four existing policies are renamed rather than dropped and recreated. A policy body
-- is stored against the table's OID, so `USING (auth_is_barn_manager(barn_id))` and #1019's
-- qualified `horse_expenses.barn_id` both follow the table rename on their own -- a rename
-- reaches the same end state as a drop-and-recreate with no chance of the recreated body
-- drifting from the original.
ALTER POLICY "manager_all_horse_expenses" ON public.appointments
  RENAME TO "manager_all_appointments";
ALTER POLICY "trainer_select_horse_expenses" ON public.appointments
  RENAME TO "trainer_select_appointments";

ALTER POLICY "manager_all_expense_horses" ON public.appointment_horses
  RENAME TO "manager_all_appointment_horses";
ALTER POLICY "trainer_select_expense_horses" ON public.appointment_horses
  RENAME TO "trainer_select_appointment_horses";

-- appointment_costs is manager-only, matching `transactions`: this table is the whole reason
-- the split exists, so a trainer reading it must come back empty rather than filtered by
-- column. RLS filters rows, and the authenticated table grant stays, so a trainer's SELECT
-- returns zero rows instead of erroring -- which is what lets expenses.ts hydrate costs with
-- one role-blind query (see attachCosts).
ALTER TABLE public.appointment_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manager_all_appointment_costs" ON public.appointment_costs
  FOR ALL TO authenticated
  USING (auth_is_barn_manager(barn_id))
  WITH CHECK (auth_is_barn_manager(barn_id));
