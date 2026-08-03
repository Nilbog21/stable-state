'use client'
import { Card } from '@/components/ui/Card'
import type { BarnEvent } from '@/lib/db/types'
import { formatBarnTime } from '@/lib/format-date'

// No "Today"/weekday label -- every item on a Day view already belongs to the one
// day its heading names, so a per-item date label would just repeat that.

// No event detail page exists (only manager-only settings/events/[id] editing) -- unlike
// CalendarLessonCard/CalendarAppointmentCard, this renders as a plain (non-link) Card.
export function CalendarEventCard({ event }: { event: BarnEvent }) {
  const display = formatBarnTime(event.event_at)

  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{display}</p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{event.title}</p>
      {event.notes && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{event.notes}</p>
      )}
    </Card>
  )
}
