-- #1640: one explicit flag governing whether an appointment appears on a calendar.
--
-- `appointments` holds both genuine visits (Veterinary, Farrier) and pure bills (Insurance,
-- Tack, Feed), and `expense_type` is free text with no flag distinguishing them. The in-app
-- calendar had been standing in a proxy rule -- getScheduleForRange dropped any appointment
-- with a null expense_time -- which both misfiled a time-less farrier day as a bill and gave
-- the .ics feed nothing safe to union in. This column replaces that proxy everywhere.
ALTER TABLE public.appointments
  ADD COLUMN shows_on_calendar BOOLEAN NOT NULL DEFAULT false;

-- Backfill is the retired proxy rule verbatim, so no appointment that was on a calendar the
-- day before this deploys is off one the day after. Deliberately *not* narrowed to future
-- rows: the dashboard takes an unrestricted `date` param with an always-enabled Previous
-- link, so a past timed appointment still renders on its own historical day, and a
-- future-only backfill would have hidden every one of them permanently.
UPDATE public.appointments
SET shows_on_calendar = true
WHERE expense_time IS NOT NULL;
