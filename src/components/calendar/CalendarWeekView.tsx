import { CalendarDayView } from './CalendarDayView'
import { EmptyState } from '@/components/EmptyState'
import { formatCalendarDate } from '@/lib/local-day'
import type { DayScheduleDisplayItem } from './dayScheduleItems'
import type { Role } from '@/lib/db/types'

// The Week view: a vertical stack of 7 day sections (mobile-first -- a side-by-side
// 7-column grid doesn't fit a ~400px screen). Each section reuses CalendarDayView, the
// same shared day-cell rendering piece the Day view itself is built on, except an empty
// day gets a compact one-line message here rather than CalendarDayView's own full
// illustrated empty state, which would be too heavy repeated 7x.
export function CalendarWeekView({
  days,
  todayStr,
  role,
  slug,
  viewerMembershipId,
}: {
  days: { date: string; items: DayScheduleDisplayItem[] }[]
  todayStr: string
  role: Role
  slug: string
  viewerMembershipId?: string
}) {
  if (days.every((day) => day.items.length === 0)) {
    // Trainers see expenses too since #1019, so the split is rider-vs-rest, not manager-vs-rest.
    const subtext =
      role === 'rider' ? 'Nothing scheduled this week.' : 'No lessons, expenses, or events scheduled this week.'
    return (
      <EmptyState
        heading="You're all clear"
        subtext={subtext}
      />
    )
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section
          key={day.date}
          className={
            day.date === todayStr
              ? 'rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-800/50 dark:bg-blue-950/30'
              : undefined
          }
        >
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {formatCalendarDate(day.date)}
            {day.date === todayStr && ' · Today'}
          </h3>
          {day.items.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing scheduled for this day.</p>
          ) : (
            <CalendarDayView items={day.items} role={role} slug={slug} viewerMembershipId={viewerMembershipId} />
          )}
        </section>
      ))}
    </div>
  )
}
