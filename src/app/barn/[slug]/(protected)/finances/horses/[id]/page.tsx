import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseIncomeDetail } from '@/lib/db/lesson-finances'
import { getHorseExpenseDetail } from '@/lib/db/expense-finances'
import { resolveFinancesMonth, formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import { formatShortDate } from '@/lib/format-date'
import { LocalDateTime } from '@/components/LocalDateTime'
import { Th, Td } from '@/components/ui/Table'

const DATE_ONLY_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

type CombinedRow =
  | { kind: 'lesson'; key: string; date: string; href: string; amount: number; horseCount: number; split: number }
  | { kind: 'lease' | 'board'; key: string; date: string; href: string; amount: number }
  | { kind: 'expense'; key: string; date: string; href: string; amount: number; horseCount: number; split: number }

const TYPE_LABELS: Record<CombinedRow['kind'], string> = {
  lesson: 'Lesson',
  lease: 'Lease',
  board: 'Boarding',
  expense: 'Expense',
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

  const [{ horseName, rows, chargeRows, total }, expenseDetail] = await Promise.all([
    getHorseIncomeDetail(barn.id, horseId, startDate, endDate),
    getHorseExpenseDetail(barn.id, horseId, startDate, endDate),
  ])

  const combinedRows: CombinedRow[] = [
    ...rows.map((row): CombinedRow => ({
      kind: 'lesson',
      key: row.lessonId,
      date: row.lessonAt,
      href: `/barn/${slug}/lessons/${row.lessonId}`,
      amount: row.fee,
      horseCount: row.horseCount,
      split: row.splitAmount,
    })),
    ...chargeRows.map((row): CombinedRow => ({
      kind: row.kind,
      key: row.chargeId,
      date: row.period,
      href: `/barn/${slug}/agreements/${row.agreementId}?kind=${row.kind}`,
      amount: row.fee,
    })),
    ...expenseDetail.rows.map((row): CombinedRow => ({
      kind: 'expense',
      key: row.expenseId,
      date: row.expenseDate,
      href: `/barn/${slug}/expenses/${row.expenseId}`,
      amount: row.amount,
      horseCount: row.horseCount,
      split: row.splitAmount,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const net = total - expenseDetail.total

  const monthQ = `month=${formatMonthParam(startDate)}`
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
                <Th>Horses</Th>
                <Th>Split</Th>
              </tr>
            </thead>
            <tbody>
              {combinedRows.map((row) => {
                const forceParens = row.kind === 'expense'
                return (
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
                    <Td>{formatCurrency(row.amount, { forceParens })}</Td>
                    <Td>{'horseCount' in row ? row.horseCount : '—'}</Td>
                    <Td>{formatCurrency('split' in row ? row.split : row.amount, { forceParens })}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex justify-between border-t border-zinc-300 pt-3 text-sm font-semibold text-zinc-900 dark:border-zinc-600 dark:text-zinc-50">
            <span>Net</span>
            <span>{formatCurrency(net)}</span>
          </div>
        </div>
      )}
    </main>
  )
}
