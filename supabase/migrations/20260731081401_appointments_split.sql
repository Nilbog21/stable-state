-- #1148: split the appointment from its cost.
--
-- A vet or farrier visit *is* an appointment -- a calendar entry with a date, time,
-- recipient, type and horses. A cost is an attribute it may carry. horse_expenses
-- conflated the two, and #1019 turned that conflation into an exposure: to make the New
-- Lesson conflict dot fire on a vet/farrier day it granted trainers barn-scoped SELECT on
-- horse_expenses/expense_horses, and RLS filters rows rather than columns, so the same
-- grant handed trainers amount and payment_type. Managers and trainers are both
-- `authenticated`, so #937's REVOKE-and-regrant-per-column trick on
-- lesson_horses.exertion_level cannot discriminate between them without first moving the
-- manager's own expense reads behind a SECURITY DEFINER relay.
--
-- Moving the *money* out of the barn-visible table closes it at the schema with no relay,
-- and is the smaller of the two possible splits. RLS lands in the companion
-- ..._appointments_rls.sql; the four expense RPCs in ..._appointment_functions.sql.

ALTER TABLE public.horse_expenses RENAME TO appointments;
ALTER TABLE public.expense_horses RENAME TO appointment_horses;
ALTER TABLE public.appointment_horses RENAME COLUMN expense_id TO appointment_id;

-- ALTER TABLE ... RENAME follows neither triggers nor indexes, so both would otherwise keep
-- their horse_expenses_* names and read as leftovers of a dropped table. The auto-named
-- PK/UNIQUE constraints are deliberately left alone -- nothing in this repo references a
-- constraint by name.
ALTER TRIGGER horse_expenses_set_updated_at ON public.appointments
  RENAME TO appointments_set_updated_at;
ALTER INDEX horse_expenses_barn_id_expense_date_idx
  RENAME TO appointments_barn_id_expense_date_idx;

-- One row per appointment that has a cost. `amount` is NOT NULL on purpose: the absence of a
-- row is then the single unambiguous encoding of "not priced yet", which is exactly what the
-- old nullable horse_expenses.amount meant. payment_type stays nullable -- a known cost that
-- hasn't been paid. The composite FK matches the repo's cross-barn-integrity convention.
CREATE TABLE public.appointment_costs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barn_id        UUID NOT NULL REFERENCES public.barns(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL,
  amount         NUMERIC(10,2) NOT NULL,
  payment_type   public.payment_type_enum,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id),
  FOREIGN KEY (barn_id, appointment_id) REFERENCES public.appointments (barn_id, id) ON DELETE CASCADE
);

CREATE TRIGGER appointment_costs_set_updated_at
  BEFORE UPDATE ON public.appointment_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfilled from the columns about to be dropped. A row with amount IS NULL AND
-- payment_type IS NOT NULL (an unpriced expense somehow marked paid) is a nonsense state
-- with no amount for the payment type to describe; its payment_type is intentionally
-- dropped rather than carried into a cost row that would have to invent an amount.
INSERT INTO public.appointment_costs (barn_id, appointment_id, amount, payment_type)
SELECT barn_id, id, amount, payment_type
FROM public.appointments
WHERE amount IS NOT NULL;

ALTER TABLE public.appointments
  DROP COLUMN amount,
  DROP COLUMN payment_type;

-- transactions.expense_id keeps its name (every ledger reader and the
-- transactions_expense_key partial unique index are keyed on it); only its FK target
-- follows the rename, which Postgres does on its own.
