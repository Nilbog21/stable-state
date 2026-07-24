'use client'
import { Card } from '@/components/ui/Card'
import { formatExpenseHorses, formatExpenseTime } from '@/lib/format-expense'
import type { ScheduledExpense } from '@/lib/db/types'

export function CalendarExpenseCard({ expense, slug }: { expense: ScheduledExpense; slug: string }) {
  // No "Today"/weekday label -- every item on a Day view already belongs to the one
  // day its heading names, so a per-item date label would just repeat that.
  const display = formatExpenseTime(expense.expense_time)

  return (
    <Card href={`/barn/${slug}/expenses/${expense.id}`} className="p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{display}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{expense.recipient}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{expense.expense_type}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatExpenseHorses(expense)}</p>
    </Card>
  )
}
