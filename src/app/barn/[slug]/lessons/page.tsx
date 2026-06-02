import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonsByBarn } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { deleteLessonAction } from '@/app/actions/lessons'
import { DeleteLessonButton } from './DeleteLessonButton'

export default async function LessonsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const [lessons, membership] = await Promise.all([
    getLessonsByBarn(barn.id),
    getUserMembership(user.id, barn.id),
  ])

  if (!membership) {
    notFound()
  }

  const isManager = membership.role === 'manager' || membership.role === 'admin'
  const canCreateLesson = membership.role === 'admin' || membership.role === 'manager' || membership.role === 'trainer'
  const deleteAction = deleteLessonAction.bind(null, barn.id, slug)

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Lessons
        </h1>
        {canCreateLesson && (
          <Link
            href={`/barn/${slug}/lessons/new`}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            New Lesson
          </Link>
        )}
      </div>
      {lessons.length === 0 ? (
        <p className="text-zinc-500">No lessons recorded yet.</p>
      ) : (
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
    </main>
  )
}
