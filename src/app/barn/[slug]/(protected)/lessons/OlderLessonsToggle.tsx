'use client'

import { useState } from 'react'
import type { LessonWithDetails } from '@/lib/db/types'
import { LessonListItem } from './LessonListItem'

interface Props {
  lessons: LessonWithDetails[]
  slug: string
  isManager: boolean
  deleteAction: (lessonId: string) => Promise<{ error: string } | void>
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
            <LessonListItem
              key={lesson.id}
              lesson={lesson}
              slug={slug}
              isManager={isManager}
              deleteAction={deleteAction}
            />
          ))}
        </ul>
      )}
    </>
  )
}
