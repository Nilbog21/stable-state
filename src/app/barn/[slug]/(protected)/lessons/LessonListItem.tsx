import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import type { LessonWithDetails } from '@/lib/db/types'

interface Props {
  lesson: LessonWithDetails
  slug: string
  isManager: boolean
  isTrainer: boolean
  currentUserId: string
}

export function LessonListItem({ lesson, slug, isManager, isTrainer, currentUserId }: Props) {
  const isCancelled = lesson.cancelled_at !== null
  const canManageLesson = isManager || (isTrainer && lesson.instructor_id === currentUserId)
  const canCancel =
    canManageLesson &&
    !isCancelled &&
    (new Date(lesson.lesson_at) > new Date() || lesson.payment_type === null)

  return (
    <li className="flex items-center justify-between py-4">
      <Link href={`/barn/${slug}/lessons/${lesson.id}`} className="flex flex-col gap-1 hover:underline">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(lesson.lesson_at))}
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
            {lesson.rider_names.length > 0 && (
              <span className="text-sm text-zinc-500">{lesson.rider_names.join(', ')}</span>
            )}
          </>
        )}
        <span className="flex items-center gap-2 text-sm text-zinc-500">
          {lesson.fee != null ? `$${lesson.fee} · ${lesson.tier_name}` : lesson.tier_name}
          {isCancelled && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Cancelled</span>
          )}
          {!isCancelled && lesson.payment_type === null && (lesson.fee ?? 0) > 0 && new Date(lesson.lesson_at) < new Date() && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">Unpaid</span>
          )}
        </span>
      </Link>
      {canCancel && (
        <Button href={`/barn/${slug}/lessons/${lesson.id}/cancel`} variant="danger">
          Cancel
        </Button>
      )}
    </li>
  )
}
