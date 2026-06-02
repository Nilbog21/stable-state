'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { LessonWithDetails } from '@/lib/db/types'
import { DeleteLessonButton } from './DeleteLessonButton'

interface Props {
  lessons: LessonWithDetails[]
  slug: string
  isManager: boolean
  deleteAction: (lessonId: string) => Promise<void>
}

export function OlderLessonsToggle({ lessons, slug, isManager, deleteAction }: Props) {
  const [show, setShow] = useState(false)

  if (lessons.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        {show ? 'Hide older lessons' : 'Show older lessons'}
      </button>
      {show && (
        <ul className="w-full max-w-2xl divide-y divide-zinc-200 dark:divide-zinc-800">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="flex items-center justify-between py-4">
              <Link href={`/barn/${slug}/lessons/${lesson.id}`} className="flex flex-col gap-1 hover:underline">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(lesson.lesson_at))}
                </span>
                {lesson.instructor_name && (
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{lesson.instructor_name}</span>
                )}
                {lesson.horse_names.length > 0 && (
                  <span className="text-sm text-zinc-500">{lesson.horse_names.join(', ')}</span>
                )}
                {lesson.rider_name && (
                  <span className="text-sm text-zinc-500">{lesson.rider_name}</span>
                )}
                {lesson.fee != null && (
                  <span className="text-sm text-zinc-500">${lesson.fee}</span>
                )}
              </Link>
              {isManager && (
                <DeleteLessonButton action={deleteAction.bind(null, lesson.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
