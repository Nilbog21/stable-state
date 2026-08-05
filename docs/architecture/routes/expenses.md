# Expenses routes

## `/barn/[slug]/expenses`

**Roles:** manager

Expenses split at 7-day cutoff (same pattern as lessons): recent shown immediately, older behind `OlderExpensesToggle`;
each expense renders as a full-card link (`ExpenseCard`, #947 — replacing the former table, matching the Horses/Agreements/Members/Lessons card pattern) to `/barn/[slug]/expenses/[id]`, the shared edit page — there's no separate read-only detail view;
card shows date, time (or `—`), recipient, expense type, horse(s) or "Entire Barn" (or `—` if none), and amount (or `—` if not yet entered);
"Add Expense" button links to `/barn/[slug]/expenses/new`;
no row-level Delete affordance on the list — Delete remains reachable one click further via the edit page's own Delete button;
card fields render via the shared expense formatters in `src/lib/format-expense.ts` (`formatExpenseDate`/`formatExpenseTime`/`formatExpenseAmount`/`formatExpenseHorses`), also used by the delete-confirmation page and the dashboard's `UpcomingExpenseCard` (whose `formatExpenseDateTime` now delegates its time segment to `formatExpenseTime`)

## `/barn/[slug]/expenses/new`

**Roles:** manager

`ExpenseForm`: recipient (required, free-text via native `<input list>`/`<datalist>` seeded from `getRecentRecipients`, most-recent-first), expense type (optional, same autocomplete pattern seeded from `getRecentExpenseTypes`;
blank/whitespace normalized to `"Unspecified"` server-side), date (required), time (optional — presence signals a planned/scheduled expense), amount (optional — blank for planned expenses), an "All" toggle (first row inside the Horses fieldset, divided off from the horse rows) that disables the horse checkbox list and sets `applies_to_all_horses=true` (native `disabled` semantics exclude `horse_id` from the submitted `FormData`, no extra JS needed), and notes;
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
