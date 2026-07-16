import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getRecipientExpenseDetail } from '@/lib/db/expense-finances'
import { resolveFinancesMonth, formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import { formatShortDate } from '@/lib/format-date'
import { Th, Td } from '@/components/ui/Table'

export default async function RecipientExpensePage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string; recipient: string }>
  searchParams?: Promise<{ month?: string }>
}) {
  const { slug, recipient: rawRecipient } = await params
  const recipient = decodeURIComponent(rawRecipient)
  const { barn } = await requireMembership(slug, ['manager'])

  const { month: monthParam } = await searchParams
  const { startDate, endDate, monthLabel } = resolveFinancesMonth(monthParam, barn.created_at, new Date())

  const { rows, total } = await getRecipientExpenseDetail(barn.id, recipient, startDate, endDate)

  const sortedRows = [...rows].sort((a, b) => new Date(a.expenseDate).getTime() - new Date(b.expenseDate).getTime())

  const monthQ = `month=${formatMonthParam(startDate)}`
  const backHref = `/barn/${slug}/finances?tab=recipient&${monthQ}`

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
        {recipient}
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
                <tr key={row.expenseId}>
                  <Td>
                    <Link href={`/barn/${slug}/expenses/${row.expenseId}`} className="underline">
                      {formatShortDate(row.expenseDate)}
                    </Link>
                  </Td>
                  <Td>{row.expenseType}</Td>
                  <Td>{formatCurrency(row.amount)}</Td>
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
