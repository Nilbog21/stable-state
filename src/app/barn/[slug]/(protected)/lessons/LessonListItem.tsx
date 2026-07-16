'use client'

import { Card } from '@/components/ui/Card'
import { LocalDateTime } from '@/components/LocalDateTime'
import type { LessonWithDetails } from '@/lib/db/types'
import { isLessonEligibleForAttentionBadge } from '@/lib/lesson-authorization'

const LESSON_AT_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

interface Props {
  lesson: LessonWithDetails
  slug: string
  isManager: boolean
  isTrainer: boolean
  viewerMembershipId?: string
}

export function LessonListItem({ lesson, slug, isManager, isTrainer, viewerMembershipId }: Props) {
  const isCancelled = lesson.cancelled_at !== null
  const needsAttention = lesson.needs_attention && isLessonEligibleForAttentionBadge(lesson)

  const myRiderIndex = viewerMembershipId ? lesson.rider_ids.indexOf(viewerMembershipId) : -1
  const myCancelledAt = myRiderIndex >= 0 ? lesson.rider_cancelled_ats[myRiderIndex] : null
  const isOwnParticipationCancelled = myCancelledAt !== null

  return (
    <li>
      <Card href={`/barn/${slug}/lessons/${lesson.id}`} className="flex flex-col gap-1 p-4">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          <LocalDateTime iso={lesson.lesson_at} options={LESSON_AT_OPTIONS} />
        </span>
        {lesson.instructor_name && (
          <span className="text-sm text-zinc-700 dark:text-zinc-300">{lesson.instructor_name}</span>
        )}
        {lesson.lesson_type === 'group' ? (
          <span className="text-sm text-zinc-500">{lesson.rider_count} riders, {lesson.horse_count} horses{lesson.jumping ? ' · Jumping' : ''}</span>
        ) : (
          <>
            {lesson.horse_names.length > 0 && (
              <span className="text-sm text-zinc-500">{lesson.horse_names.join(', ')}{lesson.jumping ? ' · Jumping' : ''}</span>
            )}
            {(isManager || isTrainer) && lesson.rider_names.length > 0 && (
              <span className="text-sm text-zinc-500">{lesson.rider_names.join(', ')}</span>
            )}
          </>
        )}
        <span className="flex items-center gap-2 text-sm text-zinc-500">
          ${lesson.fee} · {lesson.tier_name}
          {lesson.series_id !== null && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">Recurring</span>
          )}
          {isCancelled && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Cancelled</span>
          )}
          {!isCancelled && isOwnParticipationCancelled && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Cancelled</span>
          )}
          {!isCancelled && lesson.payment_type === null && lesson.fee > 0 && new Date(lesson.lesson_at) < new Date() && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">Unpaid</span>
          )}
          {needsAttention && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">Needs Attention</span>
          )}
        </span>
      </Card>
    </li>
  )
}
