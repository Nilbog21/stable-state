'use client'
import { Card } from '@/components/ui/Card'
import { formatExpenseHorses, formatExpenseTime } from '@/lib/format-expense'
import type { ScheduledExpense } from '@/lib/db/types'
import { localToday } from '@/lib/local-day'

export function formatExpenseDateTime(expense: { expense_date: string; expense_time: string }, now: Date): string {
  const time = formatExpenseTime(expense.expense_time)
  if (expense.expense_date === localToday(now)) return `Today · ${time}`

  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${expense.expense_date}T00:00:00Z`)
  )
  return `${date} · ${time}`
}

export function UpcomingExpenseCard({ expense, slug }: { expense: ScheduledExpense; slug: string }) {
  const display = formatExpenseDateTime(expense, new Date())

  return (
    <Card href={`/barn/${slug}/expenses/${expense.id}`} className="p-4">
      {/* suppressHydrationWarning: server (UTC) and client (local TZ) produce different "Today" comparisons */}
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50" suppressHydrationWarning>{display}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{expense.recipient}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{expense.expense_type}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatExpenseHorses(expense)}</p>
    </Card>
  )
}
