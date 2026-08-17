import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getOutstandingLessons, getOutstandingCancellationFees, mergeOutstandingItems } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
import type { OutstandingItem, Role } from '@/lib/db/types'
import { formatBarnDate, formatShortDate } from '@/lib/format-date'
import { formatFee } from '@/lib/format-currency'

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
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ from?: string }>
}) {
  const { slug } = await params
  const { from } = await searchParams
  const { user, barn, membership } = await requireMembership(slug, ['manager', 'trainer', 'rider'])

  const role = membership.role as Role
  const [lessons, charges, cancellationFees] = await Promise.all([
    getOutstandingLessons(barn.id, user.id, role),
    getOutstandingCharges(barn.id, barn.timezone, user.id, role),
    getOutstandingCancellationFees(barn.id, user.id, role),
  ])
  const items = mergeOutstandingItems(lessons, charges, cancellationFees, barn.timezone)

  // #1555 — this page has two entry points and role alone can't tell them apart. `from` is a
  // fixed token, not a path, so nothing user-supplied ever reaches the href; anything other than
  // the one token we emit falls through to the role-based target a direct visit gets.
  const backHref = from === 'dashboard' || role !== 'manager' ? `/barn/${slug}` : `/barn/${slug}/finances`

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
              // /barn/[slug]/agreements/[id] is manager-only, so a lease/board row is only
              // linkable for a manager viewer — a trainer/rider would otherwise hit notFound().
              const href = item.itemType === 'lesson'
                ? `/barn/${slug}/lessons/${item.id}`
                : item.itemType === 'cancellation_fee'
                ? `/barn/${slug}/lessons/${item.linkId}`
                : role === 'manager'
                ? `/barn/${slug}/agreements/${item.linkId}`
                : undefined
              const dateDisplay =
                item.itemType === 'lesson' || item.itemType === 'cancellation_fee'
                  ? formatBarnDate(item.date)
                  : formatShortDate(item.date)
              return (
              <tr key={item.id}>
                <Td>
                  {href ? (
                    <Link href={href} className="underline">
                      {dateDisplay}
                    </Link>
                  ) : (
                    dateDisplay
                  )}
                </Td>
                <Td>{TYPE_LABELS[item.itemType]}</Td>
                <Td>{item.instructorName ?? '—'}</Td>
                <Td>{item.riderNames.join(', ') || '—'}</Td>
                <Td>
                  {formatFee(item.fee)}
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
