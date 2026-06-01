import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonsByBarn } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { deleteLessonAction } from '@/app/actions/lessons'

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

  const isManager = membership?.role === 'manager' || membership?.role === 'admin'
  const deleteAction = deleteLessonAction.bind(null, barn.id, slug)

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Lessons
      </h1>
      {lessons.length === 0 ? (
        <p className="text-zinc-500">No lessons recorded yet.</p>
      ) : (
        <ul className="w-full max-w-2xl divide-y divide-zinc-200 dark:divide-zinc-800">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="flex items-center justify-between py-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {new Date(lesson.lesson_at).toLocaleString()}
                </span>
                {lesson.fee != null && (
                  <span className="text-sm text-zinc-500">${lesson.fee}</span>
                )}
              </div>
              {isManager && (
                <form action={deleteAction.bind(null, lesson.id)}>
                  <button
                    type="submit"
                    className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Delete
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
