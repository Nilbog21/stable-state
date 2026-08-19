-- #1013: getScheduleForRange range-query performance. Composite (not single-column,
-- unlike transactions_barn_id_idx) since this DAL always filters barn_id AND
-- range-filters the date column together in the same query.
CREATE INDEX lessons_barn_id_lesson_at_idx ON public.lessons (barn_id, lesson_at);
CREATE INDEX horse_expenses_barn_id_expense_date_idx ON public.horse_expenses (barn_id, expense_date, expense_time);
