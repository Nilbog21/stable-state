import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getUpcomingLessons } from '@/lib/db/lessons'
import { getPendingMemberships } from '@/lib/db/barn-memberships'
import { getDueDocuments } from '@/lib/db/documents'
import { getUpcomingScheduledExpenses } from '@/lib/db/expenses'
import { getOutstandingLessons } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import type { DueDocument, LessonWithDetails, ScheduledExpense } from '@/lib/db/types'
import { UpcomingLessonsSections } from './UpcomingLessonsSections'
import { DocumentRemindersSection } from './DocumentRemindersSection'
import { Button } from '@/components/ui/Button'

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
  let unpaidLessonsCount = 0
  let unpaidChargesCount = 0
  let userRole: 'manager' | 'trainer' | 'rider' | null = null
  let membershipId: string | undefined

  if (user) {
    const membership = await getUserMembership(user.id, barn.id)
    if (membership?.role) {
      membershipId = membership.id
      userRole = membership.role as 'manager' | 'trainer' | 'rider'
      const now = new Date()
      const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      const [lessons, pending, due, expenses, outstandingLessons, outstandingCharges] = await Promise.all([
        getUpcomingLessons(barn.id, now.toISOString(), weekOut.toISOString(), user.id, membership.role),
        membership.role === 'manager' ? getPendingMemberships(barn.id) : Promise.resolve([]),
        membership.role === 'manager' ? getDueDocuments(barn.id, now.toISOString().slice(0, 10)) : Promise.resolve([]),
        membership.role === 'manager'
          ? getUpcomingScheduledExpenses(barn.id, now.toISOString(), weekOut.toISOString())
          : Promise.resolve([]),
        getOutstandingLessons(barn.id, user.id, membership.role),
        getOutstandingCharges(barn.id, user.id, membership.role),
      ])
      upcomingLessons = lessons
      pendingCount = pending.length
      dueDocuments = due
      upcomingExpenses = expenses
      unpaidLessonsCount = outstandingLessons.length
      unpaidChargesCount = outstandingCharges.length
    }
  }

  const hasReminders = pendingCount > 0 || dueDocuments.length > 0 || unpaidLessonsCount > 0 || unpaidChargesCount > 0

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>
      {hasReminders && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Reminders
          </h2>
          <div className="space-y-2">
            {pendingCount > 0 && (
              <div>
                <Button href={`/barn/${slug}/settings`} variant="warning">
                  {pendingCount} pending {pendingCount === 1 ? 'new member request' : 'new member requests'}
                </Button>
              </div>
            )}
            {unpaidLessonsCount > 0 && (
              <div>
                <Button href={`/barn/${slug}/finances/outstanding`} variant="warning">
                  {unpaidLessonsCount} unpaid lesson{unpaidLessonsCount !== 1 ? 's' : ''}
                </Button>
              </div>
            )}
            {unpaidChargesCount > 0 && (
              <div>
                <Button href={`/barn/${slug}/finances/outstanding`} variant="warning">
                  {unpaidChargesCount} unpaid lease{unpaidChargesCount !== 1 ? 's' : ''}/boarding
                </Button>
              </div>
            )}
          </div>
          <DocumentRemindersSection slug={slug} dueDocuments={dueDocuments} />
        </section>
      )}
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
