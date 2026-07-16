'use client'
import Link from 'next/link'
import { Td } from '@/components/ui/Table'
import { SortableTh } from './SortableTh'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { RecipientExpenseSummary } from '@/lib/db/types'

type SortKey = 'recipient' | 'totalExpenses'

function getValue(row: RecipientExpenseSummary, key: SortKey): string | number {
  switch (key) {
    case 'recipient':
      return row.recipient
    case 'totalExpenses':
      return row.totalExpenses
  }
}

export function ByPaidToTable({
  rows,
  slug,
  monthParam,
}: {
  rows: RecipientExpenseSummary[]
  slug: string
  monthParam: string
}) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<RecipientExpenseSummary, SortKey>(rows, getValue, 'recipient')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="recipient" label="Recipient" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="totalExpenses" label="Expense Amount" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.recipient}>
              <Td>
                <Link href={`/barn/${slug}/finances/expenses/${encodeURIComponent(row.recipient)}?month=${monthParam}`} className="underline">
                  {row.recipient}
                </Link>
              </Td>
              <Td>{formatCurrency(row.totalExpenses)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
