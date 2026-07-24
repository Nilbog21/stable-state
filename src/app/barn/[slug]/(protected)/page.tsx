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
import { instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'
import { isValidDateString, addDays, formatCalendarDate } from '@/lib/local-day'
import { mergeDayScheduleDisplayItems, type DayScheduleDisplayItem } from '@/components/calendar/dayScheduleItems'
import { CalendarDayView } from '@/components/calendar/CalendarDayView'
import type { DueDocument } from '@/lib/db/types'
import { DocumentRemindersSection } from './DocumentRemindersSection'
import { Button } from '@/components/ui/Button'

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
  searchParams?: Promise<{ date?: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()

  let dayItems: DayScheduleDisplayItem[] = []
  let dueDocuments: DueDocument[] = []
  let unpaidLessonsCount = 0
  let unpaidChargesCount = 0
  let userRole: 'manager' | 'trainer' | 'rider' | null = null
  let membershipId: string | undefined
  let selectedDate = ''
  let todayStr = ''

  if (user) {
    const membership = await getUserMembership(user.id, barn.id)
    if (membership?.role) {
      membershipId = membership.id
      userRole = membership.role as 'manager' | 'trainer' | 'rider'

      todayStr = instantToLocalWallClock(new Date(), barn.timezone).slice(0, 10)
      const { date: requestedDate } = await searchParams
      selectedDate = requestedDate && isValidDateString(requestedDate) ? requestedDate : todayStr

      const dayStart = wallClockToInstant(`${selectedDate}T00:00:00`, barn.timezone).toISOString()
      const dayEnd = wallClockToInstant(`${addDays(selectedDate, 1)}T00:00:00`, barn.timezone).toISOString()

      const [scheduleItems, due, outstandingLessons, outstandingCancellationFees, outstandingCharges] = await Promise.all([
        getScheduleForRange(barn.id, dayStart, dayEnd, barn.timezone),
        membership.role === 'manager' ? getDueDocuments(barn.id, new Date().toISOString().slice(0, 10)) : Promise.resolve([]),
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
      // shown, not every timed expense getScheduleForRange itself returns.
      const expenses = expensesRaw.filter((expense) => expense.amount === null)

      dayItems = mergeDayScheduleDisplayItems(scopedItems, lessons, expenses, events)
      dueDocuments = due
      unpaidLessonsCount = outstandingLessons.length + outstandingCancellationFees.length
      unpaidChargesCount = outstandingCharges.length
    }
  }

  const hasReminders = dueDocuments.length > 0 || unpaidLessonsCount > 0 || unpaidChargesCount > 0

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>
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
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link href={`/barn/${slug}?date=${addDays(selectedDate, -1)}`} aria-label="Previous day" className={dayNavLinkClass}>
              &lt;
            </Link>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {formatCalendarDate(selectedDate)}
              {selectedDate === todayStr && ' · Today'}
            </h2>
            <Link href={`/barn/${slug}?date=${addDays(selectedDate, 1)}`} aria-label="Next day" className={dayNavLinkClass}>
              &gt;
            </Link>
          </div>
          {selectedDate !== todayStr && (
            <div className="mb-4">
              <Button href={`/barn/${slug}`} variant="primary" size="sm">
                Today
              </Button>
            </div>
          )}
          <CalendarDayView items={dayItems} role={userRole} slug={slug} viewerMembershipId={membershipId} />
        </section>
      )}
    </main>
  )
}
