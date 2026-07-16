/**
 * Pure expense-rendering formatters (date, time, amount, horse list) shared
 * by the expenses list cards, the expense delete-confirmation page, and the
 * dashboard's `UpcomingExpenseCard`.
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
