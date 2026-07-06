'use client'
import { UpcomingLessonCard, isSameLocalDay } from './UpcomingLessonCard'
import { EmptyState } from '@/components/EmptyState'
import type { LessonWithDetails } from '@/lib/db/types'

const sectionHeadingClass =
  'mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400'

export function UpcomingLessonsSections({
  lessons,
  role,
  slug,
  viewerMembershipId,
}: {
  lessons: LessonWithDetails[]
  role: 'manager' | 'trainer' | 'rider'
  slug: string
  viewerMembershipId?: string
}) {
  if (lessons.length === 0) {
    return (
      <EmptyState
        heading="You're all clear"
        subtext="No lessons scheduled for the next 7 days."
      />
    )
  }

  // Server (SSR) and client hydration can compute `now` in different timezones,
  // so a lesson right at the day boundary could theoretically land in a
  // different section between renders. Same accepted tradeoff as the
  // suppressHydrationWarning text mismatch in UpcomingLessonCard, just
  // structural instead of textual here; React recovers by re-rendering
  // client-side, so this stays synchronous rather than deferring to a
  // post-mount effect (which would flash the section layout on every load).
  const now = new Date()
  const today = lessons.filter((lesson) => isSameLocalDay(new Date(lesson.lesson_at), now))
  const thisWeek = lessons.filter((lesson) => !isSameLocalDay(new Date(lesson.lesson_at), now))

  return (
    <>
      {today.length > 0 && (
        <section className="mb-8">
          <h2 className={sectionHeadingClass}>Today</h2>
          <div className="space-y-3">
            {today.map((lesson) => (
              <UpcomingLessonCard
                key={lesson.id}
                lesson={lesson}
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
            {thisWeek.map((lesson) => (
              <UpcomingLessonCard
                key={lesson.id}
                lesson={lesson}
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
