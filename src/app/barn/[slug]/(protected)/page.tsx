import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getUpcomingLessons } from '@/lib/db/lessons'
import { getPendingMemberships } from '@/lib/db/barn-memberships'
import { getDueDocuments } from '@/lib/db/documents'
import type { DueDocument, LessonWithDetails } from '@/lib/db/types'
import { UpcomingLessonsSections } from './UpcomingLessonsSections'

const RECORD_TYPE_LABELS: Record<string, string> = {
  insurance_binder: 'Insurance Binder',
  coggins: 'Coggins',
  shot_record: 'Shot Record',
  contract: 'Contract',
  instructor_contract: 'Instructor Contract',
  liability_waiver: 'Liability Waiver',
  lease_agreement: 'Lease Agreement',
  boarding_contract: 'Boarding Contract',
  other: 'Other',
}

function formatDate(dateOnly: string): string {
  return new Date(dateOnly).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function dueDocumentHref(slug: string, doc: DueDocument): string {
  return doc.entity === 'horse' ? `/barn/${slug}/horses/${doc.ownerId}` : `/barn/${slug}/members/${doc.ownerId}`
}

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
      const [lessons, pending, due] = await Promise.all([
        getUpcomingLessons(barn.id, now.toISOString(), weekOut.toISOString(), user.id, membership.role),
        membership.role === 'manager' ? getPendingMemberships(barn.id) : Promise.resolve([]),
        membership.role === 'manager' ? getDueDocuments(barn.id, now.toISOString().slice(0, 10)) : Promise.resolve([]),
      ])
      upcomingLessons = lessons
      pendingCount = pending.length
      dueDocuments = due
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
      {dueDocuments.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Document Reminders
          </h2>
          <ul className="space-y-2">
            {dueDocuments.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={dueDocumentHref(slug, doc)}
                  className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                >
                  <span className="font-medium">
                    {doc.ownerName} — {RECORD_TYPE_LABELS[doc.recordType] ?? doc.recordType}
                  </span>
                  <span>{formatDate(doc.reminderDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {upcomingLessons !== null && userRole !== null && (
        <UpcomingLessonsSections
          lessons={upcomingLessons}
          role={userRole}
          slug={slug}
          viewerMembershipId={membershipId}
        />
      )}
    </main>
  )
}
