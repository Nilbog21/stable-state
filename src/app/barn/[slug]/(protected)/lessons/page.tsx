import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonsByBarn } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { deleteLessonAction } from '@/app/actions/lessons'
import { OlderLessonsToggle } from './OlderLessonsToggle'
import { LessonListItem } from './LessonListItem'

const OLDER_LESSON_CUTOFF_DAYS = 7

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

  const isManager = membership.role === 'manager'
  const canCreateLesson = membership.role === 'manager' || membership.role === 'trainer'
  const deleteAction = deleteLessonAction.bind(null, barn.id, slug)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - OLDER_LESSON_CUTOFF_DAYS)
  const recentLessons = lessons.filter((l) => new Date(l.lesson_at) >= cutoff)
  const olderLessons = lessons.filter((l) => new Date(l.lesson_at) < cutoff)

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
        <>
          {recentLessons.length > 0 && (
            <ul className="w-full max-w-2xl divide-y divide-zinc-200 dark:divide-zinc-800">
              {recentLessons.map((lesson) => (
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
          <OlderLessonsToggle
            lessons={olderLessons}
            slug={slug}
            isManager={isManager}
            deleteAction={deleteAction}
          />
        </>
      )}
    </main>
  )
}
