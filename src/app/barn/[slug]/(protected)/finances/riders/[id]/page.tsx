import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getRiderIncomeDetail } from '@/lib/db/lesson-finances'
import { resolveFinancesMonth, formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import { formatShortDate } from '@/lib/format-date'
import { LocalDateTime, DATE_ONLY_OPTIONS } from '@/components/LocalDateTime'
import { Th, Td } from '@/components/ui/Table'


type CombinedRow =
  | { kind: 'lesson'; key: string; date: string; href: string; amount: number; riderCount: number; split: number }
  | { kind: 'lease' | 'board'; key: string; date: string; href: string; amount: number }

const TYPE_LABELS: Record<CombinedRow['kind'], string> = {
  lesson: 'Lesson',
  lease: 'Lease',
  board: 'Boarding',
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

  const combinedRows: CombinedRow[] = [
    ...rows.map((row): CombinedRow => ({
      kind: 'lesson',
      key: row.lessonId,
      date: row.lessonAt,
      href: `/barn/${slug}/lessons/${row.lessonId}`,
      amount: row.fee,
      riderCount: row.riderCount,
      split: row.splitAmount,
    })),
    ...chargeRows.map((row): CombinedRow => ({
      kind: row.kind,
      key: row.chargeId,
      date: row.period,
      href: `/barn/${slug}/agreements/${row.agreementId}?kind=${row.kind}`,
      amount: row.fee,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const monthQ = `month=${formatMonthParam(startDate)}`
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

      {combinedRows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No activity in {monthLabel}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mb-8 w-full">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Amount</Th>
                <Th>Riders</Th>
                <Th>Split</Th>
              </tr>
            </thead>
            <tbody>
              {combinedRows.map((row) => (
                <tr key={row.key}>
                  <Td>
                    <Link href={row.href} className="underline">
                      {row.kind === 'lesson' ? (
                        <LocalDateTime iso={row.date} options={DATE_ONLY_OPTIONS} />
                      ) : (
                        formatShortDate(row.date)
                      )}
                    </Link>
                  </Td>
                  <Td>{TYPE_LABELS[row.kind]}</Td>
                  <Td>{formatCurrency(row.amount)}</Td>
                  <Td>{'riderCount' in row ? row.riderCount : '—'}</Td>
                  <Td>{formatCurrency('split' in row ? row.split : row.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between border-t border-zinc-300 pt-3 text-sm font-semibold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </main>
  )
}
