import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getDueDocuments } from '@/lib/db/documents'
import { getScheduleForRange, scopeScheduleItemsForRole } from '@/lib/db/schedule'
import { getLessonsByIds } from '@/lib/db/lessons'
import { getExpensesByIds } from '@/lib/db/expenses'
import { getEventsByIds } from '@/lib/db/barn-events'
import { getOutstandingLessons, getOutstandingCancellationFees } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { isValidDateString, addDays, formatCalendarDate, getWeekDates } from '@/lib/local-day'
import { mergeDayScheduleDisplayItems, groupScheduleItemsByDay, type DayScheduleDisplayItem } from '@/components/calendar/dayScheduleItems'
import { CalendarDayView } from '@/components/calendar/CalendarDayView'
import { CalendarWeekView } from '@/components/calendar/CalendarWeekView'
import type { DueDocument } from '@/lib/db/types'
import { DocumentRemindersSection } from './DocumentRemindersSection'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { LocalDateTime } from '@/components/LocalDateTime'

// Icon-only Prev/Next controls have no good structural fit with the shared Button
// component (see ARCHITECTURE.md's documented exception, mirrored by LessonForm's
// Normal/Group switch) -- raw Tailwind instead. Both are plain SSR links (?date=...), no
// client JS, and sized to a 44px minimum tap target per the project's mobile conventions.
// Styled to match the Finances page's month-nav Prev/Next controls (#1015 review finding)
// so the two date-paging affordances read as the same pattern app-wide.
const dayNavLinkClass =
  'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50'

export default async function BarnDashboardPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ date?: string; view?: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()

  let dayItems: DayScheduleDisplayItem[] = []
  let weekDays: { date: string; items: DayScheduleDisplayItem[] }[] = []
  let dueDocuments: DueDocument[] = []
  let unpaidLessonsCount = 0
  let unpaidChargesCount = 0
  let userRole: 'manager' | 'trainer' | 'rider' | null = null
  let membershipId: string | undefined
  let selectedDate = ''
  let todayStr = ''
  let view: 'day' | 'week' = 'day'
  let weekDates: string[] = []

  if (user) {
    const membership = await getUserMembership(user.id, barn.id)
    if (membership?.role) {
      membershipId = membership.id
      userRole = membership.role as 'manager' | 'trainer' | 'rider'

      todayStr = barnToday(barn.timezone)
      const { date: requestedDate, view: requestedView } = await searchParams
      selectedDate = requestedDate && isValidDateString(requestedDate) ? requestedDate : todayStr
      view = requestedView === 'week' ? 'week' : 'day'
      weekDates = getWeekDates(selectedDate)

      const rangeStartDate = view === 'week' ? weekDates[0] : selectedDate
      const rangeStart = wallClockToInstant(`${rangeStartDate}T00:00:00`, barn.timezone).toISOString()
      const rangeEnd = wallClockToInstant(`${addDays(rangeStartDate, view === 'week' ? 7 : 1)}T00:00:00`, barn.timezone).toISOString()

      const [scheduleItems, due, outstandingLessons, outstandingCancellationFees, outstandingCharges] = await Promise.all([
        getScheduleForRange(barn.id, rangeStart, rangeEnd, barn.timezone),
        membership.role === 'manager' ? getDueDocuments(barn.id, todayStr) : Promise.resolve([]),
        getOutstandingLessons(barn.id, user.id, membership.role),
        getOutstandingCancellationFees(barn.id, user.id, membership.role),
        getOutstandingCharges(barn.id, user.id, membership.role),
      ])

      const scopedItems = scopeScheduleItemsForRole(scheduleItems, membership.role, membership.id)
      const lessonIds = scopedItems.filter((item) => item.itemType === 'lesson').map((item) => item.id)
      const expenseIds = scopedItems.filter((item) => item.itemType === 'expense').map((item) => item.id)
      const eventIds = scopedItems.filter((item) => item.itemType === 'event').map((item) => item.id)

      const [lessons, expensesRaw, events] = await Promise.all([
        getLessonsByIds(barn.id, lessonIds),
        getExpensesByIds(barn.id, expenseIds),
        getEventsByIds(barn.id, eventIds),
      ])
      // Mirrors the pre-Day-view dashboard: only "planned" expenses (amount IS NULL) are
      // shown, not every timed appointment getScheduleForRange itself returns.
      //
      // #1148 made this filter manager-only in effect rather than by role check. Costs live
      // on the manager-only appointment_costs table now, so a trainer reads `amount` as null
      // for every appointment and sees the whole appointment schedule, while a manager still
      // sees just the unpriced ones. That asymmetry is the model's point, not a leak: a
      // calendar has no business filtering by cost, and the figure a trainer can't read is
      // exactly the one the split removed from their reach.
      const expenses = expensesRaw.filter((expense) => expense.amount === null)

      if (view === 'week') {
        weekDays = groupScheduleItemsByDay(weekDates, scopedItems, lessons, expenses, events)
      } else {
        dayItems = mergeDayScheduleDisplayItems(scopedItems, lessons, expenses, events)
      }
      dueDocuments = due
      unpaidLessonsCount = outstandingLessons.length + outstandingCancellationFees.length
      unpaidChargesCount = outstandingCharges.length
    }
  }

  const weekIncludesToday = weekDates.includes(todayStr)
  const isViewingCurrentPeriod = view === 'week' ? weekIncludesToday : selectedDate === todayStr
  const stepDays = view === 'week' ? 7 : 1
  const navLabel = view === 'week' ? 'week' : 'day'
  const viewQuery = view === 'week' ? 'view=week&' : ''
  const todayHref = `/barn/${slug}${view === 'week' ? '?view=week' : ''}`
  const currentPeriodLabel = view === 'week' ? 'This Week' : 'Today'

  const hasReminders = dueDocuments.length > 0 || unpaidLessonsCount > 0 || unpaidChargesCount > 0
  const demoResetAt = barn.is_demo
    ? new Date(new Date(barn.created_at).getTime() + 7 * 60 * 60 * 1000).toISOString()
    : null
  const dayPillDate = view === 'week' ? (weekIncludesToday ? todayStr : weekDates[0]) : selectedDate

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>
      {demoResetAt && (
        <div className="mb-8 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          This is a demo barn. Data resets at approximately{' '}
          <LocalDateTime iso={demoResetAt} options={{ timeStyle: 'short' }} />.
        </div>
      )}
      {hasReminders && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Reminders
          </h2>
          <div className="space-y-2">
            {unpaidLessonsCount > 0 && (
              <div>
                <Button href={`/barn/${slug}/finances/outstanding`} variant="warning">
                  {unpaidLessonsCount} unpaid lesson{unpaidLessonsCount !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
            {unpaidChargesCount > 0 && (
              <div>
                <Button href={`/barn/${slug}/finances/outstanding`} variant="warning">
                  {unpaidChargesCount} unpaid lease{unpaidChargesCount !== 1 ? 's' : ''}/boarding
                </Button>
              </div>
            )}
            <DocumentRemindersSection slug={slug} dueDocuments={dueDocuments} />
          </div>
        </section>
      )}
      {userRole !== null && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Calendar
          </h2>
          <div className="mb-3 flex gap-2">
            <Pill href={`/barn/${slug}?date=${dayPillDate}`} active={view === 'day'}>
              Day
            </Pill>
            <Pill href={`/barn/${slug}?view=week&date=${selectedDate}`} active={view === 'week'}>
              Week
            </Pill>
          </div>
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link
              href={`/barn/${slug}?${viewQuery}date=${addDays(selectedDate, -stepDays)}`}
              aria-label={`Previous ${navLabel}`}
              className={dayNavLinkClass}
            >
              &lt;
            </Link>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {view === 'week' ? `${formatCalendarDate(weekDates[0])} – ${formatCalendarDate(weekDates[6])}` : formatCalendarDate(selectedDate)}
              {isViewingCurrentPeriod && ` · ${currentPeriodLabel}`}
            </h2>
            <Link
              href={`/barn/${slug}?${viewQuery}date=${addDays(selectedDate, stepDays)}`}
              aria-label={`Next ${navLabel}`}
              className={dayNavLinkClass}
            >
              &gt;
            </Link>
          </div>
          {!isViewingCurrentPeriod && (
            <div className="mb-4">
              <Button href={todayHref} variant="primary" size="sm">
                {currentPeriodLabel}
              </Button>
            </div>
          )}
          {view === 'week' ? (
            <CalendarWeekView days={weekDays} todayStr={todayStr} role={userRole} slug={slug} viewerMembershipId={membershipId} />
          ) : (
            <CalendarDayView items={dayItems} role={userRole} slug={slug} viewerMembershipId={membershipId} />
          )}
        </section>
      )}
    </main>
  )
}
