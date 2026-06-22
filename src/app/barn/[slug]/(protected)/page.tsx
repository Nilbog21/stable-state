import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getUpcomingLessons } from '@/lib/db/lessons'
import { getPendingMemberships } from '@/lib/db/barn-memberships'
import { signOut } from '@/app/actions/auth'
import type { LessonWithDetails } from '@/lib/db/types'
import { LocalTime } from './LocalTime'

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
  let pendingCount = 0

  if (data.user) {
    const membership = await getUserMembership(data.user.id, barn.id)
    if (membership?.role === 'manager') {
      const now = new Date()
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const [lessons, pending] = await Promise.all([
        getUpcomingLessons(barn.id, now.toISOString(), weekOut.toISOString()),
        getPendingMemberships(barn.id),
      ])
      upcomingLessons = lessons
      pendingCount = pending.length
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
      {pendingCount > 0 && (
        <div className="mb-8">
          <Link
            href={`/barn/${slug}/settings`}
            className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
          >
            {pendingCount} pending request{pendingCount !== 1 ? 's' : ''}
          </Link>
        </div>
      )}
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
                    <LocalTime iso={lesson.lesson_at} />
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
