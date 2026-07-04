import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getRiderIncomeDetail } from '@/lib/db/lesson-finances'
import { resolveFinancesMonth } from '../../page'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export default async function RiderIncomePage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams?: Promise<{ month?: string }>
}) {
  const { slug, id: riderId } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const { month: monthParam } = await searchParams
  const { startDate, endDate, monthLabel } = resolveFinancesMonth(monthParam, barn.created_at, new Date())

  const { riderName, rows, chargeRows, total } = await getRiderIncomeDetail(barn.id, riderId, startDate, endDate)

  const monthQ = `month=${pad4(startDate.getUTCFullYear())}-${pad2(startDate.getUTCMonth() + 1)}`
  const backHref = `/barn/${slug}/finances?tab=rider&${monthQ}`

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-6">
        <Link
          href={backHref}
          className="text-sm underline text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Back
        </Link>
      </div>
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {riderName}
      </h1>
      <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">{monthLabel}</p>

      {rows.length === 0 && chargeRows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No lessons in {monthLabel}.</p>
      ) : (
        <div className="overflow-x-auto">
          {rows.length > 0 && (
            <table className="mb-8 w-full">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="pb-2 pr-6">Date</th>
                  <th className="pb-2 pr-6">Fee</th>
                  <th className="pb-2 pr-6">Riders</th>
                  <th className="pb-2">Split</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.lessonId} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                      <Link
                        href={`/barn/${slug}/lessons/${row.lessonId}`}
                        className="underline"
                      >
                        {formatDate(row.lessonAt)}
                      </Link>
                    </td>
                    <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                      {row.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                    <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                      {row.riderCount}
                    </td>
                    <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">
                      {row.splitAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {chargeRows.length > 0 && (
            <table className="mb-8 w-full">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="pb-2 pr-6">Date</th>
                  <th className="pb-2 pr-6">Type</th>
                  <th className="pb-2">Fee</th>
                </tr>
              </thead>
              <tbody>
                {chargeRows.map((row) => (
                  <tr key={row.chargeId} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                      <Link
                        href={`/barn/${slug}/agreements/${row.agreementId}`}
                        className="underline"
                      >
                        {formatDate(row.period)}
                      </Link>
                    </td>
                    <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                      {row.kind === 'lease' ? 'Lease' : 'Boarding'}
                    </td>
                    <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">
                      {row.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex justify-between border-t border-zinc-300 pt-3 text-sm font-semibold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
            <span>Total</span>
            <span>{total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
          </div>
        </div>
      )}
    </main>
  )
}
