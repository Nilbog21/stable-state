import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
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

  const user = await getAuthenticatedUser()

  if (!user) {
    notFound()
  }

  const membership = await getUserMembership(user.id, barn.id)

  if (!membership || membership.status !== 'active') {
    notFound()
  }

  const role = membership.role
  const lesson = await getLessonById(id, barn.id, role, user.id)

  if (!lesson) {
    notFound()
  }

  const instructorName = lesson.instructor_name ?? '—'

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(lesson.lesson_at))

  const canSeeNotes = role === 'trainer' || role === 'manager'

  const myRiderEntry = role === 'rider'
    ? lesson.lesson_riders.find((lr) => lr.barn_membership?.user_id === user.id) ?? null
    : null

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Lesson Detail
          </h1>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {lesson.lesson_type === 'group' ? 'Group' : 'Normal'}
          </span>
          {lesson.jumping && (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Jumping
            </span>
          )}
          {(role === 'manager' || role === 'trainer') && (
            <a
              href={`/barn/${slug}/lessons/${lesson.id}/edit`}
              className="rounded-lg border border-zinc-200 px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Edit
            </a>
          )}
        </div>
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
                <ul className="flex flex-col gap-2">
                  {lesson.lesson_horses.map((lh, i) => (
                    <li key={lh.horses?.id ?? i}>
                      <span>{lh.horses?.name ?? '—'}</span>{' '}
                      <span className="text-zinc-500">(exertion {lh.exertion_level})</span>
                      {canSeeNotes && lh.horses?.id && (
                        <div className="mt-1">
                          <p className="text-xs font-medium text-zinc-500">Horse Notes</p>
                          <p className="text-sm text-zinc-900 dark:text-zinc-50">{lh.horse_notes ?? '—'}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Rider(s)</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {lesson.lesson_riders.length === 0 ? '—' : lesson.lesson_type === 'group' ? (
                <ul className="flex flex-col gap-2">
                  {lesson.lesson_riders.map((lr, i) => (
                    <li key={lr.barn_membership?.id ?? i}>
                      <span>{lr.barn_membership?.name ?? '—'}</span>
                      {canSeeNotes && lr.barn_membership?.id && (
                        <div className="mt-1 flex flex-col gap-1">
                          <p className="text-xs font-medium text-zinc-500">Rider Notes</p>
                          <p className="text-sm text-zinc-900 dark:text-zinc-50">{lr.rider_notes ?? '—'}</p>
                          <div className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Private</p>
                            <p className="text-sm text-zinc-900 dark:text-zinc-50">{lr.private_notes ?? '—'}</p>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col gap-2">
                  {lesson.lesson_riders.map((lr, i) => (
                    <div key={lr.barn_membership?.id ?? i}>
                      <span>{lr.barn_membership?.name ?? '—'}</span>
                      {canSeeNotes && lr.barn_membership?.id && (
                        <div className="mt-1 flex flex-col gap-1">
                          <p className="text-xs font-medium text-zinc-500">Rider Notes</p>
                          <p className="text-sm text-zinc-900 dark:text-zinc-50">{lr.rider_notes ?? '—'}</p>
                          <div className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Private</p>
                            <p className="text-sm text-zinc-900 dark:text-zinc-50">{lr.private_notes ?? '—'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {role === 'rider' && myRiderEntry && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-zinc-500">Your Notes</p>
                      <p className="text-sm text-zinc-900 dark:text-zinc-50">{myRiderEntry.rider_notes ?? '—'}</p>
                    </div>
                  )}
                </div>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Fee</dt>
            <dd className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
              {lesson.fee != null ? `$${lesson.fee}` : '—'}
              {lesson.payment_type === null && (lesson.fee ?? 0) > 0 && new Date(lesson.lesson_at) < new Date() && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">Unpaid</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </main>
  )
}
