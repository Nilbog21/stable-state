'use client'
import type { LessonWithDetails } from '@/lib/db/types'
import { Card } from '@/components/ui/Card'
import { isLessonEligibleForAttentionBadge } from '@/lib/lesson-authorization'

// No "Today"/weekday label -- every item on a Day view already belongs to the one
// day its heading names, so a per-item date label would just repeat that.
export function formatLessonTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function CalendarLessonCard({
  lesson,
  role,
  slug,
  viewerMembershipId,
}: {
  lesson: LessonWithDetails
  role: 'manager' | 'trainer' | 'rider'
  slug: string
  viewerMembershipId?: string
}) {
  const display = formatLessonTime(lesson.lesson_at)

  const myRiderIndex = role === 'rider' && viewerMembershipId ? lesson.rider_ids.indexOf(viewerMembershipId) : -1
  const isOwnParticipationCancelled = myRiderIndex >= 0 && lesson.rider_cancelled_ats[myRiderIndex] !== null
  const needsAttention = lesson.needs_attention && isLessonEligibleForAttentionBadge(lesson)

  return (
    <Card href={`/barn/${slug}/lessons/${lesson.id}`} className="p-4">
      {/* suppressHydrationWarning: server (host TZ) and client (browser TZ) render this
          viewer-local time-of-day string differently, per #935's convention */}
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50" suppressHydrationWarning>{display}</p>
      {lesson.cancelled_at !== null && (
        <span className="mt-1 inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Cancelled</span>
      )}
      {lesson.cancelled_at === null && isOwnParticipationCancelled && (
        <span className="mt-1 inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Cancelled</span>
      )}
      {needsAttention && (
        <span className="mt-1 inline-block rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">Needs Attention</span>
      )}
      {lesson.horse_names.length > 0 && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {lesson.horse_names.join(', ')}
        </p>
      )}
      {role === 'rider' && lesson.instructor_name && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{lesson.instructor_name}</p>
      )}
      {role !== 'rider' && lesson.rider_names.length > 0 && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {lesson.rider_names.join(', ')}
        </p>
      )}
    </Card>
  )
}
