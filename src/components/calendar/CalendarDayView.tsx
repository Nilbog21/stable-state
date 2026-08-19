import { CalendarLessonCard } from './CalendarLessonCard'
import { CalendarAppointmentCard } from './CalendarAppointmentCard'
import { CalendarEventCard } from './CalendarEventCard'
import { EmptyState } from '@/components/EmptyState'
import type { DayScheduleDisplayItem } from './dayScheduleItems'
import type { Role } from '@/lib/db/types'

// The shared "day-cell rendering" piece: given one day's already-hydrated, already-ordered
// items, render them. Deliberately has no date heading/nav of its own -- the Day view page
// wants one big heading, while the Week view (CalendarWeekView) wants a small per-day-section
// heading above each stacked day, so that stays out of this component.
export function CalendarDayView({
  items,
  role,
  slug,
  viewerMembershipId,
}: {
  items: DayScheduleDisplayItem[]
  role: Role
  slug: string
  viewerMembershipId?: string
}) {
  if (items.length === 0) {
    // Trainers see appointments too since #1019, so the split is rider-vs-rest, not
    // manager-vs-rest. "appointments" rather than "expenses" (#1148) -- a trainer has no
    // business thinking of a farrier visit as an expense, and the manager's own expense
    // record is reached from the Expenses nav, not from here.
    const subtext =
      role === 'rider' ? 'Nothing scheduled for this day.' : 'No lessons, appointments, or events scheduled for this day.'
    return (
      <EmptyState
        heading="You're all clear"
        subtext={subtext}
      />
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.itemType === 'lesson') {
          return (
            <CalendarLessonCard
              key={`lesson-${item.id}`}
              lesson={item.lesson}
              role={role}
              slug={slug}
              viewerMembershipId={viewerMembershipId}
            />
          )
        }
        if (item.itemType === 'expense') {
          return <CalendarAppointmentCard key={`expense-${item.id}`} appointment={item.expense} slug={slug} />
        }
        return <CalendarEventCard key={`event-${item.id}`} event={item.event} />
      })}
    </div>
  )
}
