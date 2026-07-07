import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getUpcomingLessons } from '@/lib/db/lessons'
import { getPendingMemberships } from '@/lib/db/barn-memberships'
import { getDueDocuments } from '@/lib/db/documents'
import { getUpcomingScheduledExpenses } from '@/lib/db/expenses'
import type { DueDocument, LessonWithDetails, ScheduledExpense } from '@/lib/db/types'
import { UpcomingLessonsSections } from './UpcomingLessonsSections'
import { DocumentRemindersSection } from './DocumentRemindersSection'

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
  let upcomingExpenses: ScheduledExpense[] = []
  let pendingCount = 0
  let dueDocuments: DueDocument[] = []
  let userRole: 'manager' | 'trainer' | 'rider' | null = null
  let membershipId: string | undefined

  if (user) {
    const membership = await getUserMembership(user.id, barn.id)
    if (membership?.role) {
      membershipId = membership.id
      userRole = membership.role as 'manager' | 'trainer' | 'rider'
      const now = new Date()
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const [lessons, pending, due, expenses] = await Promise.all([
        getUpcomingLessons(barn.id, now.toISOString(), weekOut.toISOString(), user.id, membership.role),
        membership.role === 'manager' ? getPendingMemberships(barn.id) : Promise.resolve([]),
        membership.role === 'manager' ? getDueDocuments(barn.id, now.toISOString().slice(0, 10)) : Promise.resolve([]),
        membership.role === 'manager'
          ? getUpcomingScheduledExpenses(barn.id, now.toISOString(), weekOut.toISOString())
          : Promise.resolve([]),
      ])
      upcomingLessons = lessons
      pendingCount = pending.length
      dueDocuments = due
      upcomingExpenses = expenses
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
      <DocumentRemindersSection slug={slug} dueDocuments={dueDocuments} />
      {upcomingLessons !== null && userRole !== null && (
        <UpcomingLessonsSections
          lessons={upcomingLessons}
          expenses={upcomingExpenses}
          role={userRole}
          slug={slug}
          viewerMembershipId={membershipId}
        />
      )}
    </main>
  )
}
