import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getOutstandingLessons, getOutstandingCancellationFees, mergeOutstandingItems } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import type { OutstandingItem, Role } from '@/lib/db/types'
import { formatShortDate } from '@/lib/format-date'
import { Th, Td } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'

const TYPE_LABELS: Record<OutstandingItem['itemType'], string> = {
  lesson: 'Lesson',
  lease: 'Lease',
  board: 'Boarding',
  cancellation_fee: 'Cancellation Fee',
}

export default async function OutstandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { user, barn, membership } = await requireMembership(slug, ['manager', 'trainer', 'rider'])

  const role = membership.role as Role
  const [lessons, charges, cancellationFees] = await Promise.all([
    getOutstandingLessons(barn.id, user.id, role),
    getOutstandingCharges(barn.id, user.id, role),
    getOutstandingCancellationFees(barn.id, user.id, role),
  ])
  const items = mergeOutstandingItems(lessons, charges, cancellationFees)

  const backHref = membership.role === 'manager' ? `/barn/${slug}/finances` : `/barn/${slug}`

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-6">
        <Link
          href={backHref}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Back
        </Link>
      </div>
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Outstanding Payments
      </h1>

      {items.length === 0 ? (
        <EmptyState
          heading="No outstanding items."
          subtext="Outstanding lessons, leases, and boarding charges will appear here."
        />
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Instructor</Th>
              <Th>Rider(s)</Th>
              <Th>Fee</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const lessonId = item.itemType === 'lesson' ? item.id : item.itemType === 'cancellation_fee' ? item.linkId : undefined
              return (
              <tr key={item.id}>
                <Td>
                  {lessonId ? (
                    <Link
                      href={`/barn/${slug}/lessons/${lessonId}`}
                      className="underline"
                    >
                      {formatShortDate(item.date)}
                    </Link>
                  ) : (
                    formatShortDate(item.date)
                  )}
                </Td>
                <Td>{TYPE_LABELS[item.itemType]}</Td>
                <Td>{item.instructorName ?? '—'}</Td>
                <Td>{item.riderNames.join(', ') || '—'}</Td>
                <Td>
                  {item.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </Td>
              </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </main>
  )
}
