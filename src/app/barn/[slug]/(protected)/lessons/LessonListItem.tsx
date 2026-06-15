import Link from 'next/link'
import type { LessonWithDetails } from '@/lib/db/types'
import { DeleteLessonButton } from './DeleteLessonButton'

interface Props {
  lesson: LessonWithDetails
  slug: string
  isManager: boolean
  deleteAction: (lessonId: string) => Promise<{ error: string } | void>
}

export function LessonListItem({ lesson, slug, isManager, deleteAction }: Props) {
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
        <span className="text-sm text-zinc-500">
          {lesson.fee != null ? `$${lesson.fee} · ${lesson.tier_name}` : lesson.tier_name}
        </span>
      </Link>
      {isManager && (
        <DeleteLessonButton action={deleteAction.bind(null, lesson.id)} />
      )}
    </li>
  )
}
