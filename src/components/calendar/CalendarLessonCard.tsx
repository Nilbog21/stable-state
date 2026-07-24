'use client'
import type { LessonWithDetails } from '@/lib/db/types'
import { Card } from '@/components/ui/Card'
import { isSameLocalDay } from '@/lib/local-day'
import { isLessonEligibleForAttentionBadge } from '@/lib/lesson-authorization'

export function formatLessonDate(iso: string, now: Date): string {
  const d = new Date(iso)
  const isToday = isSameLocalDay(d, now)

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today · ${time}`

  const date = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  return `${date} · ${time}`
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
  const now = new Date()
  const display = formatLessonDate(lesson.lesson_at, now)

  const myRiderIndex = role === 'rider' && viewerMembershipId ? lesson.rider_ids.indexOf(viewerMembershipId) : -1
  const isOwnParticipationCancelled = myRiderIndex >= 0 && lesson.rider_cancelled_ats[myRiderIndex] !== null
  const needsAttention = lesson.needs_attention && isLessonEligibleForAttentionBadge(lesson)

  return (
    <Card href={`/barn/${slug}/lessons/${lesson.id}`} className="p-4">
      {/* suppressHydrationWarning: server (UTC) and client (local TZ) produce different strings */}
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
