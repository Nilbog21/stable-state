import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseIncomeDetail } from '@/lib/db/lesson-finances'
import { resolveFinancesMonth } from '../../page'
import { formatCurrency } from '@/lib/format-currency'
import { Th, Td } from '@/components/ui/Table'

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

export default async function HorseIncomePage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams?: Promise<{ month?: string }>
}) {
  const { slug, id: horseId } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const { month: monthParam } = await searchParams
  const { startDate, endDate, monthLabel } = resolveFinancesMonth(monthParam, barn.created_at, new Date())

  const { horseName, rows, chargeRows, total } = await getHorseIncomeDetail(barn.id, horseId, startDate, endDate, barn.instructor_cut)

  const monthQ = `month=${pad4(startDate.getUTCFullYear())}-${pad2(startDate.getUTCMonth() + 1)}`
  const backHref = `/barn/${slug}/finances?tab=horse&${monthQ}`

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
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {horseName}
      </h1>
      <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">{monthLabel}</p>

      {rows.length === 0 && chargeRows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No lessons in {monthLabel}.</p>
      ) : (
        <div className="overflow-x-auto">
          {rows.length > 0 && (
            <table className="mb-8 w-full">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Fee</Th>
                  <Th>Horses</Th>
                  <Th>Split</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.lessonId}>
                    <Td>
                      <Link
                        href={`/barn/${slug}/lessons/${row.lessonId}`}
                        className="underline"
                      >
                        {formatDate(row.lessonAt)}
                      </Link>
                    </Td>
                    <Td>{formatCurrency(row.fee)}</Td>
                    <Td>{row.horseCount}</Td>
                    <Td>{formatCurrency(row.splitAmount)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {chargeRows.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Leases & Boarding</h2>
              <table className="mb-8 w-full">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Fee</Th>
                  </tr>
                </thead>
                <tbody>
                  {chargeRows.map((row) => (
                    <tr key={row.chargeId}>
                      <Td>
                        <Link
                          href={`/barn/${slug}/agreements/${row.agreementId}`}
                          className="underline"
                        >
                          {formatDate(row.period)}
                        </Link>
                      </Td>
                      <Td>{row.kind === 'lease' ? 'Lease' : 'Boarding'}</Td>
                      <Td>{row.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="flex justify-between border-t border-zinc-300 pt-3 text-sm font-semibold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </main>
  )
}
