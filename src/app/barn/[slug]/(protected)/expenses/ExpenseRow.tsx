import { Td, TableActions } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import type { ExpenseWithHorses } from '@/lib/db/types'

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

export function ExpenseRow({ expense, slug }: { expense: ExpenseWithHorses; slug: string }) {
  return (
    <tr>
      <Td>{formatExpenseDate(expense.expense_date)}</Td>
      <Td tone="secondary">{formatExpenseTime(expense.expense_time)}</Td>
      <Td>{expense.recipient}</Td>
      <Td tone="secondary">{expense.expense_type}</Td>
      <Td tone="secondary">{formatExpenseHorses(expense)}</Td>
      <Td>{formatExpenseAmount(expense.amount)}</Td>
      <TableActions>
        <Button href={`/barn/${slug}/expenses/${expense.id}`} variant="ghost">Edit</Button>
        <Button href={`/barn/${slug}/expenses/${expense.id}/delete`} variant="danger">Delete</Button>
      </TableActions>
    </tr>
  )
}
