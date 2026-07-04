'use client'

import { useState } from 'react'
import type { LessonWithDetails } from '@/lib/db/types'
import { LessonListItem } from './LessonListItem'

interface Props {
  lessons: LessonWithDetails[]
  slug: string
  isManager: boolean
  isTrainer: boolean
  currentMembershipId: string
  viewerMembershipId?: string
}

export function OlderLessonsToggle({ lessons, slug, isManager, isTrainer, currentMembershipId, viewerMembershipId }: Props) {
  const [show, setShow] = useState(false)

  if (lessons.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="min-h-11 px-4 py-3 text-sm text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        {show ? 'Hide older lessons' : 'Show older lessons'}
      </button>
      {show && (
        <ul className="w-full max-w-2xl space-y-2">
          {lessons.map((lesson) => (
            <LessonListItem
              key={lesson.id}
              lesson={lesson}
              slug={slug}
              isManager={isManager}
              isTrainer={isTrainer}
              currentMembershipId={currentMembershipId}
              viewerMembershipId={viewerMembershipId}
            />
          ))}
        </ul>
      )}
    </>
  )
}
