'use client'
import Link from 'next/link'
import type { LessonWithDetails } from '@/lib/db/types'

export function formatLessonDate(iso: string, now: Date): string {
  const d = new Date(iso)
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today · ${time}`

  const date = d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  return `${date} · ${time}`
}

export function UpcomingLessonCard({
  lesson,
  role,
  slug,
}: {
  lesson: LessonWithDetails
  role: 'manager' | 'trainer' | 'rider'
  slug: string
}) {
  const display = formatLessonDate(lesson.lesson_at, new Date())

  return (
    <Link
      href={`/barn/${slug}/lessons/${lesson.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
    >
      {/* suppressHydrationWarning: server (UTC) and client (local TZ) produce different strings */}
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50" suppressHydrationWarning>{display}</p>
      {lesson.cancelled_at !== null && (
        <span className="mt-1 inline-block rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Cancelled</span>
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
    </Link>
  )
}
