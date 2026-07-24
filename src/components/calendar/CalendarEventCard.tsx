'use client'
import { Card } from '@/components/ui/Card'
import { isSameLocalDay } from '@/lib/local-day'
import type { BarnEvent } from '@/lib/db/types'

export function formatEventDate(iso: string, now: Date): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isSameLocalDay(d, now)) return `Today · ${time}`

  const date = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  return `${date} · ${time}`
}

// No event detail page exists (only manager-only settings/events/[id] editing) -- unlike
// CalendarLessonCard/CalendarExpenseCard, this renders as a plain (non-link) Card.
export function CalendarEventCard({ event }: { event: BarnEvent }) {
  const display = formatEventDate(event.event_at, new Date())

  return (
    <Card className="p-4">
      {/* suppressHydrationWarning: server (UTC) and client (local TZ) produce different "Today" comparisons */}
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50" suppressHydrationWarning>{display}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{event.title}</p>
      {event.notes && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{event.notes}</p>
      )}
    </Card>
  )
}
