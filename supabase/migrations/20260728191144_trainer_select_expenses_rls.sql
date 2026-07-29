-- #1019 review fix: trainers use the same New Lesson form as managers, and its
-- month conflict calendar marks days where a selected horse already has a lesson
-- OR an expense. Until now the expense half could never fire for a trainer --
-- horse_expenses/expense_horses each carried exactly one policy
-- (manager_all_*, FOR ALL USING (auth_is_barn_manager(barn_id))), so
-- getScheduleForRange (src/lib/db/schedule.ts) returned a trainer zero expense
-- rows silently, and USER_GUIDE_TRAINER.md described a dot its own audience
-- couldn't see. Barn-side guidance is that trainers should see vet/farrier
-- appointments.
--
-- Same role-membership idiom as lessons_select_staff/lesson_horses_select_staff
-- (release3_rls.sql), narrowed to role = 'trainer' -- manager_all_* already
-- covers managers, and riders stay excluded (their dashboard keeps returning no
-- expense items, unchanged).
--
-- Accepted tradeoff: RLS filters rows, not columns, so this also lets a trainer
-- read amount/notes/payment_type off these rows via a direct PostgREST/DAL call.
-- Postgres has no per-app-role column grant -- managers and trainers are both
-- `authenticated`, so the REVOKE-and-regrant-per-column trick #937 used on
-- lesson_horses.exertion_level can't discriminate between them here without
-- moving the manager's own expense reads behind a SECURITY DEFINER relay. No UI
-- surfaces those columns to a trainer: the dashboard filters to amount IS NULL
-- planned expenses, and every /barn/[slug]/expenses route is manager-gated.

CREATE POLICY "trainer_select_horse_expenses" ON public.horse_expenses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = horse_expenses.barn_id
      AND status = 'active' AND role = 'trainer'
  ));

CREATE POLICY "trainer_select_expense_horses" ON public.expense_horses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.barn_memberships
    WHERE user_id = auth.uid() AND barn_id = expense_horses.barn_id
      AND status = 'active' AND role = 'trainer'
  ));
