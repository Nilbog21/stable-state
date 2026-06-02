import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const [lesson, membership] = await Promise.all([
    getLessonById(id, barn.id),
    getUserMembership(user.id, barn.id),
  ])

  if (!membership) {
    notFound()
  }

  if (!lesson) {
    notFound()
  }

  const instructorName = lesson.profiles
    ? `${lesson.profiles.first_name} ${lesson.profiles.last_name}`
    : '—'

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(lesson.lesson_at))

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="w-full max-w-2xl">
        <h1 className="mb-6 text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Lesson Detail
        </h1>
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Date &amp; Time</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{formattedDate}</dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Instructor</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{instructorName}</dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Horse(s)</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {lesson.lesson_horses.length === 0 ? '—' : (
                <ul className="flex flex-col gap-1">
                  {lesson.lesson_horses.map((lh) => (
                    <li key={lh.horses.id}>
                      {lh.horses.name}{' '}
                      <span className="text-zinc-500">(exertion {lh.exertion_level})</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Rider</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {lesson.lesson_riders.length === 0 ? '—' : lesson.lesson_riders.map((lr) => lr.riders.name).join(', ')}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Fee</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {lesson.fee != null ? `$${lesson.fee}` : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </main>
  )
}
