import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getUpcomingLessons } from '@/lib/db/lessons'
import { getPendingMemberships } from '@/lib/db/barn-memberships'
import type { LessonWithDetails } from '@/lib/db/types'
import { UpcomingLessonCard } from './UpcomingLessonCard'
import { EmptyState } from '@/components/EmptyState'

export default async function BarnDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()

  let upcomingLessons: LessonWithDetails[] | null = null
  let pendingCount = 0
  let userRole: 'manager' | 'trainer' | 'rider' | null = null
  let membershipId: string | undefined

  if (user) {
    const membership = await getUserMembership(user.id, barn.id)
    if (membership?.role) {
      membershipId = membership.id
      userRole = membership.role as 'manager' | 'trainer' | 'rider'
      const now = new Date()
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const [lessons, pending] = await Promise.all([
        getUpcomingLessons(barn.id, now.toISOString(), weekOut.toISOString(), user.id, membership.role),
        membership.role === 'manager' ? getPendingMemberships(barn.id) : Promise.resolve([]),
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
      {upcomingLessons !== null && userRole !== null && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Your Upcoming Lessons
          </h2>
          {upcomingLessons.length === 0 ? (
            <EmptyState
              heading="You're all clear"
              subtext="No lessons scheduled for the next 7 days."
            />
          ) : (
            <div className="space-y-3">
              {upcomingLessons.map((lesson) => (
                <UpcomingLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  role={userRole}
                  slug={slug}
                  viewerMembershipId={membershipId}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
