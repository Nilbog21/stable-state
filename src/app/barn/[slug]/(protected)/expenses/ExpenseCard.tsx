import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { ExpenseWithHorses } from '@/lib/db/types'
import { formatExpenseDate, formatExpenseTime, formatExpenseAmount, formatExpenseHorses, isExpensePastDue } from '@/lib/format-expense'

export function ExpenseCard({ expense, slug, now }: { expense: ExpenseWithHorses; slug: string; now?: number }) {
  const pastDue = isExpensePastDue(expense, now ?? new Date().getTime())

  return (
    <Card href={`/barn/${slug}/expenses/${expense.id}`} className="p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {formatExpenseDate(expense.expense_date)}
        {expense.expense_time && ` · ${formatExpenseTime(expense.expense_time)}`}
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {expense.recipient} · {expense.expense_type}
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatExpenseHorses(expense)}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-medium">
        {expense.amount === null ? (
          <span className={pastDue ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-50'}>
            (no amount specified)
          </span>
        ) : (
          <span className="text-zinc-900 dark:text-zinc-50">{formatExpenseAmount(expense.amount)}</span>
        )}
        {pastDue && <Badge tone="amber">Past Due</Badge>}
      </p>
    </Card>
  )
}
