'use client'
import { Card } from '@/components/ui/Card'
import { formatExpenseHorses, formatExpenseTime } from '@/lib/format-expense'
import type { Role, ScheduledExpense } from '@/lib/db/types'

export function CalendarExpenseCard({ expense, slug, role }: { expense: ScheduledExpense; slug: string; role: Role }) {
  // No "Today"/weekday label -- every item on a Day view already belongs to the one
  // day its heading names, so a per-item date label would just repeat that.
  const display = formatExpenseTime(expense.expense_time)
  // Manager-only link: #1019 granted trainers SELECT on horse_expenses so these cards render
  // on their dashboard, but /barn/[slug]/expenses/[id] is still requireMembership(['manager'])
  // and would 404 them. The card stays visible, just inert. Trainers get a real destination
  // once the appointment/expense split lands (see the #1019 follow-up) -- an appointment view
  // carries the date/recipient/type/horses they need without amount or payment_type.
  const href = role === 'manager' ? `/barn/${slug}/expenses/${expense.id}` : undefined

  return (
    <Card href={href} className="p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{display}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{expense.recipient}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{expense.expense_type}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatExpenseHorses(expense)}</p>
    </Card>
  )
}
