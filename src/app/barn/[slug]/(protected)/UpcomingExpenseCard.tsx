'use client'
import Link from 'next/link'
import { formatExpenseHorses } from './expenses/ExpenseRow'
import type { ScheduledExpense } from '@/lib/db/types'

export function isExpenseToday(expenseDate: string, now: Date): boolean {
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return expenseDate === todayStr
}

export function formatExpenseDateTime(expense: { expense_date: string; expense_time: string }, now: Date): string {
  const time = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(
    new Date(`1970-01-01T${expense.expense_time}Z`)
  )
  if (isExpenseToday(expense.expense_date, now)) return `Today · ${time}`

  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${expense.expense_date}T00:00:00Z`)
  )
  return `${date} · ${time}`
}

export function UpcomingExpenseCard({ expense, slug }: { expense: ScheduledExpense; slug: string }) {
  const display = formatExpenseDateTime(expense, new Date())

  return (
    <Link
      href={`/barn/${slug}/expenses/${expense.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
    >
      {/* suppressHydrationWarning: server (UTC) and client (local TZ) produce different "Today" comparisons */}
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50" suppressHydrationWarning>{display}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{expense.recipient}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{expense.expense_type}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatExpenseHorses(expense)}</p>
    </Link>
  )
}
