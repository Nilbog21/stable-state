import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { updateRiderNotesAction, updateHorseNotesAction } from './actions'

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

  const canEditNotes = role === 'trainer' || role === 'manager'

  const myRiderEntry = role === 'rider'
    ? lesson.lesson_riders.find((lr) => lr.riders?.user_id === user.id) ?? null
    : null

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-4">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
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
          {role === 'manager' && (
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
                <ul className="flex flex-col gap-3">
                  {lesson.lesson_horses.map((lh, i) => (
                    <li key={lh.horses?.id ?? i}>
                      <div>
                        {lh.horses?.name ?? '—'}{' '}
                        <span className="text-zinc-500">(exertion {lh.exertion_level})</span>
                      </div>
                      {canEditNotes && lh.horses?.id && (
                        <form action={updateHorseNotesAction.bind(null, slug, lesson.id, lh.horses.id)} className="mt-2 flex flex-col gap-1">
                          <div className="flex flex-col gap-1 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Horse Notes</span>
                            <textarea
                              name="horseNotes"
                              defaultValue={lh.horse_notes ?? ''}
                              rows={2}
                              className="w-full rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                            />
                          </div>
                          <button type="submit" className="self-end rounded bg-zinc-800 px-3 py-1 text-xs text-white dark:bg-zinc-200 dark:text-zinc-900">
                            Save
                          </button>
                        </form>
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
              {lesson.lesson_riders.length === 0 ? '—' : canEditNotes ? (
                <ul className="flex flex-col gap-4">
                  {lesson.lesson_riders.map((lr, i) => (
                    <li key={lr.riders?.id ?? i}>
                      <div className="font-medium">{lr.riders?.name ?? '—'}</div>
                      {lr.riders?.id && <form action={updateRiderNotesAction.bind(null, slug, lesson.id, lr.riders.id)} className="mt-2 flex flex-col gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-zinc-500">Rider Notes</label>
                          <textarea
                            name="riderNotes"
                            defaultValue={lr.rider_notes ?? ''}
                            rows={2}
                            className="w-full rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                          />
                        </div>
                        <div className="flex flex-col gap-1 rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Private</span>
                          <textarea
                            name="privateNotes"
                            defaultValue={lr.private_notes ?? ''}
                            rows={2}
                            className="w-full rounded border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                          />
                        </div>
                        <button type="submit" className="self-end rounded bg-zinc-800 px-3 py-1 text-xs text-white dark:bg-zinc-200 dark:text-zinc-900">
                          Save
                        </button>
                      </form>}
                    </li>
                  ))}
                </ul>
              ) : lesson.lesson_type === 'group' ? (
                <ul className="flex flex-col gap-1">
                  {lesson.lesson_riders.map((lr, i) => (
                    <li key={lr.riders?.id ?? i}>{lr.riders?.name ?? '—'}</li>
                  ))}
                </ul>
              ) : (
                lesson.lesson_riders.map((lr) => lr.riders?.name ?? '—').join(', ')
              )}
              {role === 'rider' && myRiderEntry && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-zinc-500">Your Notes</p>
                  <p className="text-sm text-zinc-900 dark:text-zinc-50">{myRiderEntry.rider_notes ?? '—'}</p>
                </div>
              )}
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
