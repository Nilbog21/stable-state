'use client'
import { Card } from '@/components/ui/Card'
import { formatExpenseHorses, formatExpenseTime } from '@/lib/format-expense'
import type { ScheduledAppointment } from '@/lib/db/types'

export function CalendarAppointmentCard({ appointment, slug }: { appointment: ScheduledAppointment; slug: string }) {
  // No "Today"/weekday label -- every item on a Day view already belongs to the one
  // day its heading names, so a per-item date label would just repeat that.
  const display = formatExpenseTime(appointment.expense_time)
  // Linked for every role that can see the card at all. This took a `role` prop until
  // #1148: /barn/[slug]/expenses/[id] was manager-gated and would have 404'd the trainer
  // whose dashboard #1019 had just started rendering these on, so the card stayed visible
  // but inert. That route now serves a trainer a read-only appointment view -- date,
  // recipient, type, horses, notes, no cost -- so there is nothing left to withhold.
  return (
    <Card href={`/barn/${slug}/expenses/${appointment.id}`} className="p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{display}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{appointment.recipient}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{appointment.expense_type}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatExpenseHorses(appointment)}</p>
    </Card>
  )
}
