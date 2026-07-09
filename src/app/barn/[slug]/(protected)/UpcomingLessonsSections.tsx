'use client'
import { UpcomingLessonCard } from './UpcomingLessonCard'
import { UpcomingExpenseCard } from './UpcomingExpenseCard'
import { EmptyState } from '@/components/EmptyState'
import { isSameLocalDay, localToday } from '@/lib/local-day'
import type { LessonWithDetails, ScheduledExpense } from '@/lib/db/types'

const sectionHeadingClass =
  'mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'

type ScheduleItem =
  | { kind: 'lesson'; sortKey: string; lesson: LessonWithDetails }
  | { kind: 'expense'; sortKey: string; expense: ScheduledExpense }

function isItemToday(item: ScheduleItem, now: Date): boolean {
  return item.kind === 'lesson'
    ? isSameLocalDay(new Date(item.lesson.lesson_at), now)
    : item.expense.expense_date === localToday(now)
}

function ScheduleItemCard({ item, role, slug, viewerMembershipId }: {
  item: ScheduleItem
  role: 'manager' | 'trainer' | 'rider'
  slug: string
  viewerMembershipId?: string
}) {
  if (item.kind === 'lesson') {
    return (
      <UpcomingLessonCard
        lesson={item.lesson}
        role={role}
        slug={slug}
        viewerMembershipId={viewerMembershipId}
      />
    )
  }
  return <UpcomingExpenseCard expense={item.expense} slug={slug} />
}

export function UpcomingLessonsSections({
  lessons,
  expenses = [],
  role,
  slug,
  viewerMembershipId,
}: {
  lessons: LessonWithDetails[]
  expenses?: ScheduledExpense[]
  role: 'manager' | 'trainer' | 'rider'
  slug: string
  viewerMembershipId?: string
}) {
  // Only managers see the Barn Schedule expense interleave; trainer/rider dashboards
  // stay lessons-only even if a caller passes expenses.
  const effectiveExpenses = role === 'manager' ? expenses : []

  if (lessons.length === 0 && effectiveExpenses.length === 0) {
    return (
      <>
        {role === 'manager' && (
          <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">Barn Schedule</h2>
        )}
        <EmptyState
          heading="You're all clear"
          subtext={
            role === 'manager'
              ? 'No lessons or expenses scheduled for the next 7 days.'
              : 'No lessons scheduled for the next 7 days.'
          }
        />
      </>
    )
  }

  // Server (SSR) and client hydration can compute `now` in different timezones,
  // so a lesson or expense right at the day boundary could theoretically land
  // in a different section between renders. Same accepted tradeoff as the
  // suppressHydrationWarning text mismatch in UpcomingLessonCard/UpcomingExpenseCard,
  // just structural instead of textual here; React recovers by re-rendering
  // client-side, so this stays synchronous rather than deferring to a
  // post-mount effect (which would flash the section layout on every load).
  const now = new Date()

  const items: ScheduleItem[] = [
    ...lessons.map((lesson): ScheduleItem => ({ kind: 'lesson', sortKey: lesson.lesson_at, lesson })),
    ...effectiveExpenses.map((expense): ScheduleItem => ({
      kind: 'expense',
      sortKey: `${expense.expense_date}T${expense.expense_time}`,
      expense,
    })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  const today = items.filter((item) => isItemToday(item, now))
  const thisWeek = items.filter((item) => !isItemToday(item, now))

  return (
    <>
      {role === 'manager' && (
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">Barn Schedule</h2>
      )}
      {today.length > 0 && (
        <section className="mb-8">
          <h2 className={sectionHeadingClass}>Today</h2>
          <div className="space-y-3">
            {today.map((item) => (
              <ScheduleItemCard
                key={item.kind === 'lesson' ? `lesson-${item.lesson.id}` : `expense-${item.expense.id}`}
                item={item}
                role={role}
                slug={slug}
                viewerMembershipId={viewerMembershipId}
              />
            ))}
          </div>
        </section>
      )}
      {thisWeek.length > 0 && (
        <section>
          <h2 className={sectionHeadingClass}>This Week</h2>
          <div className="space-y-3">
            {thisWeek.map((item) => (
              <ScheduleItemCard
                key={item.kind === 'lesson' ? `lesson-${item.lesson.id}` : `expense-${item.expense.id}`}
                item={item}
                role={role}
                slug={slug}
                viewerMembershipId={viewerMembershipId}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
