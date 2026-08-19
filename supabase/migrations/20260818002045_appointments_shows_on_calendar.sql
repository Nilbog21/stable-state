-- #1640: one explicit flag governing whether an appointment appears on a calendar.
--
-- `appointments` holds both genuine visits (Veterinary, Farrier) and pure bills (Insurance,
-- Tack, Feed), and `expense_type` is free text with no flag distinguishing them. The in-app
-- calendar had been standing in a proxy rule -- getScheduleForRange dropped any appointment
-- with a null expense_time -- which both misfiled a time-less farrier day as a bill and gave
-- the .ics feed nothing safe to union in. This column replaces that proxy everywhere.
ALTER TABLE public.appointments
  ADD COLUMN shows_on_calendar BOOLEAN NOT NULL DEFAULT false;

-- Backfill preserves current dashboard behaviour exactly: a timed *future* appointment is
-- what the proxy rule was admitting, so those rows come out ticked and everything else does
-- not. "Future" resolves through barns.timezone rather than the session zone -- expense_date
-- and expense_time are barn-local wall-clock digits with no zone of their own, so casting
-- them straight to timestamptz would compare them in UTC and misjudge every appointment
-- within a barn's own UTC offset of now.
UPDATE public.appointments a
SET shows_on_calendar = true
FROM public.barns b
WHERE b.id = a.barn_id
  AND a.expense_time IS NOT NULL
  AND (a.expense_date + a.expense_time) AT TIME ZONE b.timezone > now();
