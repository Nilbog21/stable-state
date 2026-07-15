import { Td, TableActions } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import type { ExpenseWithHorses } from '@/lib/db/types'
import { formatExpenseDate, formatExpenseTime, formatExpenseAmount, formatExpenseHorses } from '@/lib/format-expense'

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
        <Button href={`/barn/${slug}/expenses/${expense.id}`} variant="ghost" size="sm">Edit</Button>
        <Button href={`/barn/${slug}/expenses/${expense.id}/delete`} variant="danger" size="sm">Delete</Button>
      </TableActions>
    </tr>
  )
}
