# Expenses routes

## `/barn/[slug]/expenses`

**Roles:** manager

Expenses split at 7-day cutoff (same pattern as lessons): recent shown immediately, older behind `OlderExpensesToggle`;
each expense renders as a full-card link (`ExpenseCard`, #947 — replacing the former table, matching the Horses/Agreements/Members/Lessons card pattern) to `/barn/[slug]/expenses/[id]`, the shared edit page — there's no separate read-only detail view;
card shows date with the time appended only when one is set (no `—` placeholder — #947's own follow-up commits dropped the dashes the card first shipped with), recipient · expense type, horse(s) or "Entire Barn" (or `—` if none), and amount — a null amount renders "(no amount specified)" instead, turning amber alongside an amber "Past Due" badge once the expense is past due (`isExpensePastDue`: only a still-unamounted planned expense can be past due, its due datetime `expense_date`+`expense_time`, or end-of-day when no time is set);
"Add Expense" button links to `/barn/[slug]/expenses/new`;
no row-level Delete affordance on the list — Delete remains reachable one click further via the edit page's own Delete button;
card fields render via the shared expense formatters in `src/lib/format-expense.ts` (`formatExpenseDate`/`formatExpenseTime`/`formatExpenseAmount`/`formatExpenseHorses`, plus the `isExpensePastDue` predicate behind the card's Past Due badge), also used by the delete-confirmation page, the trainer's `AppointmentDetail` (#1148), and the dashboard's `CalendarAppointmentCard` — #1015 moved+renamed the old `UpcomingExpenseCard` to `CalendarExpenseCard` and deleted `formatExpenseDateTime` (the card calls `formatExpenseTime` directly), and #1148's table split renamed it again

## `/barn/[slug]/expenses/new`

**Roles:** manager

`ExpenseForm`: recipient (required, free-text via native `<input list>`/`<datalist>` seeded from `getRecentRecipients` — ranked by recent-6-months frequency, then all-time frequency, then alphabetically, not simple recency (see [`dal/expenses.md`](../dal/expenses.md))), expense type (optional, same autocomplete pattern seeded from `getRecentExpenseTypes`;
blank/whitespace normalized to `"Unspecified"` server-side), an "All" toggle (first row inside the Horses fieldset, divided off from the horse rows) that disables the horse checkbox list and sets `applies_to_all_horses=true` (native `disabled` semantics exclude `horse_id` from the submitted `FormData`, no extra JS needed), date (required — since #1020 both the new and edit pages inject `getScheduleRangeForBarn` as the form's optional `getScheduleRange` prop, so the Date field renders as the same month conflict calendar (`MonthCalendarPicker`) the lesson form got in #1019, not the plain `<input type="date">` the form falls back to without the prop; the Horses fieldset sits above Date because the calendar's conflict dots are driven by the horse selection, and the edit page passes `excludeItemId` so the appointment never conflicts with itself), time (optional — presence signals a planned/scheduled expense; the input is hidden, its value carried by a hidden field, when the selected date is strictly before the barn's today, #770), amount (optional — blank for planned expenses), a Payment Type select (#872 — rendered only while Amount is non-blank, options Unpaid/Venmo/Zelle/Cash/Check/Freshbooks; `parseExpenseFormData` drops any stray payment type when the amount is blank, since a still-planned expense can't have collected a payment), and notes;
on recipient blur, `getMostCommonExpenseTypeAction` auto-fills expense type from `getMostCommonTypeForRecipient` and flashes it (`ring-2 ring-blue-400`, same pattern as jumping→exertion flash in `LessonForm`);
`createExpenseAction` validates and calls `createExpense`, then redirects to `/barn/[slug]/expenses`

## `/barn/[slug]/expenses/[id]`

**Roles:** manager, trainer

**Manager:** edit page reusing `ExpenseForm` pre-filled from `getExpenseById` (`notFound()` if missing); same fields as the new-expense form, "All"/individual-horse checkbox state restored from `applies_to_all_horses`/`horse_ids`, submit label "Save Changes"; `updateExpenseAction` validates (shared `parseExpenseFormData` helper used by both `createExpenseAction` and `updateExpenseAction`) and calls `updateExpense`, then redirects to `/barn/[slug]/expenses`; a "Delete" button links to `/barn/[slug]/expenses/[id]/delete`.
**Trainer (#1148):** the same route returns `AppointmentDetail` instead — a read-only card headed "Appointment" showing date, time, recipient, type, horses and notes, with no cost, no form and no Delete, returned before the three manager-only form lookups (`getHorsesByBarn`/`getRecentRecipients`/`getRecentExpenseTypes`) a trainer's view has no field for.
This replaced the deliberately-inert dashboard card #1019 left behind: that card rendered for a trainer but carried no link, because this route was manager-gated and would have `notFound()`'d them.
A render branch rather than a second `/appointments/[id]` route — the only thing the page adds over the dashboard card is `notes`.
Nothing is withheld by this component's own choices: `amount`/`payment_type` come back `null` for a trainer because `appointment_costs` is manager-only RLS, so there is no figure in scope to leak.
`/delete`, the `/expenses` list and the Expenses nav link all stay manager-only.

## `/barn/[slug]/expenses/[id]/delete`

**Roles:** manager

Confirmation page mirroring the lessons cancel pattern: summary of recipient/date/amount + destructive "Confirm Delete" button; `notFound()` if the expense doesn't exist; #941 added an unchecked-by-default "Also delete the collected record from Finances" checkbox (`alsoDeleteTransactions`), shown only when `expense.amount !== null` (i.e. an `appointment_costs` row exists, and with it a `transactions` row — both written by `sync_expense_transaction`, independent of `payment_type`/collected status, unlike the lesson case, so this checks `amount` and not a paid/unpaid flag) — an expense with no amount set stays a bare confirm with no checkbox; on submit, `deleteExpenseAction` reads the checkbox and forwards it to `deleteExpense`'s `deleteCollectedTransactions` param, which deletes the appointment (cascading to `appointment_horses` and, since #1148, `appointment_costs`) and redirects to `/barn/[slug]/expenses`
