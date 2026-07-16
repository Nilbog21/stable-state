'use client'
import Link from 'next/link'
import { Td, Th } from '@/components/ui/Table'
import { SortableTh } from './SortableTh'
import { ReconciliationFoot } from './ReconciliationFoot'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { RecipientExpenseSummary } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type SortKey = 'recipient' | 'totalExpenses'

function getValue(row: RecipientExpenseSummary, key: SortKey): string | number {
  switch (key) {
    case 'recipient':
      return row.recipient
    case 'totalExpenses':
      return row.totalExpenses
  }
}

// #971: a recipient is a pure expense concept — no lesson/agreement revenue is ever paid
// "to" a recipient, so Gross and Net are always "—", both per row and in the footer.
export function ByPaidToTable({
  rows,
  slug,
  monthParam,
  expenses,
}: {
  rows: RecipientExpenseSummary[]
  slug: string
  monthParam: string
  expenses: ReconciliationColumn
}) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<RecipientExpenseSummary, SortKey>(rows, getValue, 'recipient')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="recipient" label="Recipient" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <Th>Gross</Th>
            <SortableTh sortKey="totalExpenses" label="Expenses" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <Th>Net</Th>
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
              <Td>—</Td>
              <Td>{formatCurrency(row.totalExpenses)}</Td>
              <Td>—</Td>
            </tr>
          ))}
        </tbody>
        <ReconciliationFoot
          labelColSpan={1}
          gross={null}
          expenses={expenses}
          net={null}
          outsideInfoText="Instructor pay isn't tied to a specific recipient."
          unattributedInfoText="An expense record whose original entry was deleted after being marked paid."
        />
      </table>
    </div>
  )
}
