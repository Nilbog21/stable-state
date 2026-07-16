import { Card } from '@/components/ui/Card'
import type { ExpenseWithHorses } from '@/lib/db/types'
import { formatExpenseDate, formatExpenseTime, formatExpenseAmount, formatExpenseHorses } from '@/lib/format-expense'

export function ExpenseCard({ expense, slug }: { expense: ExpenseWithHorses; slug: string }) {
  return (
    <Card href={`/barn/${slug}/expenses/${expense.id}`} className="p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {formatExpenseDate(expense.expense_date)} · {formatExpenseTime(expense.expense_time)}
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {expense.recipient} · {expense.expense_type}
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatExpenseHorses(expense)}</p>
      <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-50">{formatExpenseAmount(expense.amount)}</p>
    </Card>
  )
}
