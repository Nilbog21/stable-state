import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getUpcomingLessons } from '@/lib/db/lessons'
import { signOut } from '@/app/actions/auth'
import type { LessonWithDetails } from '@/lib/db/types'

export default async function BarnDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()

  let upcomingLessons: LessonWithDetails[] | null = null

  if (data.user) {
    const membership = await getEffectiveMembership(data.user.id, barn.id)
    if (membership?.role === 'manager') {
      const now = new Date()
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      upcomingLessons = await getUpcomingLessons(barn.id, now.toISOString(), weekOut.toISOString())
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>
      <form action={signOut} className="mb-8">
        <button
          type="submit"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Sign out
        </button>
      </form>
      {upcomingLessons !== null && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Upcoming Lessons
          </h2>
          {upcomingLessons.length === 0 ? (
            <p className="text-sm text-zinc-500">No upcoming lessons this week</p>
          ) : (
            <ul className="space-y-2">
              {upcomingLessons.map((lesson) => (
                <li key={lesson.id} className="text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">
                    {new Date(lesson.lesson_at).toLocaleString()}
                  </span>
                  {lesson.instructor_name && (
                    <span className="ml-2">{lesson.instructor_name}</span>
                  )}
                  {lesson.horse_names.length > 0 && (
                    <span className="ml-2">{lesson.horse_names.join(', ')}</span>
                  )}
                  {lesson.rider_names.length > 0 && (
                    <span className="ml-2">{lesson.rider_names.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}
