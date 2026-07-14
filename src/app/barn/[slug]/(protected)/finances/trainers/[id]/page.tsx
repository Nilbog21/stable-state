import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getTrainerIncomeDetail } from '@/lib/db/lesson-finances'
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

export default async function TrainerIncomePage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams?: Promise<{ month?: string }>
}) {
  const { slug, id: trainerId } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const { month: monthParam } = await searchParams
  const { startDate, endDate, monthLabel } = resolveFinancesMonth(monthParam, barn.created_at, new Date())

  const { trainerName, rows, total } = await getTrainerIncomeDetail(barn.id, trainerId, startDate, endDate)

  const sortedRows = [...rows].sort((a, b) => new Date(a.lessonAt).getTime() - new Date(b.lessonAt).getTime())

  const monthQ = `month=${pad4(startDate.getUTCFullYear())}-${pad2(startDate.getUTCMonth() + 1)}`
  const backHref = `/barn/${slug}/finances?tab=trainer&${monthQ}`

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
        {trainerName}
      </h1>
      <p className="mb-8 text-sm text-zinc-500 dark:text-zinc-400">{monthLabel}</p>

      {sortedRows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No activity in {monthLabel}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mb-8 w-full">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Type</Th>
                <Th>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.lessonId}>
                  <Td>
                    <Link href={`/barn/${slug}/lessons/${row.lessonId}`} className="underline">
                      {formatDate(row.lessonAt)}
                    </Link>
                  </Td>
                  <Td>Lesson</Td>
                  <Td>{formatCurrency(row.fee)}</Td>
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
