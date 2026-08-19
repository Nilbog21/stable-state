/**
 * Pure expense-rendering formatters (date, time, amount, horse list), shared by
 * the expenses list cards, the trainer's read-only `AppointmentDetail` view
 * (#1148), the expense delete-confirmation page, and the dashboard's
 * `CalendarAppointmentCard`.
 *
 * That list covers the *formatters* only. `isExpensePastDue` below has exactly
 * one caller, `ExpenseCard` — the Past Due badge is list-only, and #1481 was
 * scoped against this header on the assumption it wasn't.
 */

export function formatExpenseDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

export function formatExpenseTime(time: string | null): string {
  if (!time) return '—'
  return new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(`1970-01-01T${time}Z`))
}

export function formatExpenseAmount(amount: number | null): string {
  return amount === null ? '—' : `$${amount.toFixed(2)}`
}

export function formatExpenseHorses(expense: { applies_to_all_horses: boolean; horse_names: string[] }): string {
  if (expense.applies_to_all_horses) return 'Entire Barn'
  return expense.horse_names.length > 0 ? expense.horse_names.join(', ') : '—'
}

/**
 * The card-side half of `getOutstandingExpenses` (`db/expenses.ts`), and deliberately the same two
 * conditions in the same order, because the two disagreeing is what #1481 was.
 *
 * Outstanding is a *missing amount, a missing payment type, or both* — an expense that has been
 * priced but never attributed to a payment method is still owed, and shows on Finances →
 * Outstanding Expenses whether or not this agrees.
 *
 * `nowWall` is the barn's own wall clock ("YYYY-MM-DDTHH:MM:SS", from `barn-timezone.ts`'s
 * `instantToLocalWallClock`), not an instant: `expense_date`/`expense_time` are zoneless barn-local
 * digits, so the comparison has to happen in that frame. Tagging them `Z` and racing `Date.now()`
 * — what this did before — fired four hours early in `America/New_York`.
 */
export function isExpensePastDue(
  expense: { amount: number | null; payment_type: string | null; expense_date: string; expense_time: string | null },
  nowWall: string
): boolean {
  if (expense.amount !== null && expense.payment_type !== null) return false
  return `${expense.expense_date}T${expense.expense_time ?? '23:59:59'}` < nowWall
}
