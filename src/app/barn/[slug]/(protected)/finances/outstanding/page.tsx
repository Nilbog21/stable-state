import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getOutstandingLessons, mergeOutstandingItems } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import type { OutstandingItem, Role } from '@/lib/db/types'

const TYPE_LABELS: Record<OutstandingItem['itemType'], string> = {
  lesson: 'Lesson',
  lease: 'Lease',
  board: 'Boarding',
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function OutstandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { user, barn, membership } = await requireMembership(slug, ['manager', 'trainer', 'rider'])

  const role = membership.role as Role
  const [lessons, charges] = await Promise.all([
    getOutstandingLessons(barn.id, user.id, role),
    getOutstandingCharges(barn.id, user.id, role),
  ])
  const items = mergeOutstandingItems(lessons, charges)

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
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No outstanding lessons.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="pb-2 pr-6">Date</th>
              <th className="pb-2 pr-6">Type</th>
              <th className="pb-2 pr-6">Instructor</th>
              <th className="pb-2 pr-6">Rider(s)</th>
              <th className="pb-2">Fee</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                  {item.itemType === 'lesson' ? (
                    <Link
                      href={`/barn/${slug}/lessons/${item.id}`}
                      className="hover:underline"
                    >
                      {formatDate(item.date)}
                    </Link>
                  ) : (
                    formatDate(item.date)
                  )}
                </td>
                <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                  {TYPE_LABELS[item.itemType]}
                </td>
                <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                  {item.instructorName ?? '—'}
                </td>
                <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                  {item.riderNames.join(', ') || '—'}
                </td>
                <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">
                  {item.fee !== null
                    ? item.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  )
}
