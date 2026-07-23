'use client'
import Link from 'next/link'
import { BreakdownTable } from './BreakdownTable'
import { formatCurrency } from '@/lib/format-currency'
import type { RecipientExpenseSummary } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type SortKey = 'recipient' | 'totalExpenses'

function getSortValue(row: RecipientExpenseSummary, key: SortKey): string | number {
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
  return (
    <BreakdownTable<RecipientExpenseSummary, SortKey>
      rows={rows}
      rowKey={(row) => row.recipient}
      defaultSortKey="recipient"
      getSortValue={getSortValue}
      gross={null}
      expenses={expenses}
      net={null}
      outsideInfoText="Instructor pay isn't tied to a specific recipient."
      unattributedInfoText="An expense record whose original entry was deleted after being marked paid."
      columns={[
        {
          sortKey: 'recipient',
          label: 'Recipient',
          renderCell: (row) => (
            <Link href={`/barn/${slug}/finances/expenses/${encodeURIComponent(row.recipient)}?month=${monthParam}`} className="underline">
              {row.recipient}
            </Link>
          ),
        },
        {
          label: 'Gross',
          infoText: 'No lesson or agreement income is ever paid directly to a recipient',
          renderCell: () => '—',
        },
        {
          sortKey: 'totalExpenses',
          label: 'Expenses',
          infoText: "This recipient's total paid expenses this month",
          renderCell: (row) => (row.totalExpenses === 0 ? '—' : formatCurrency(row.totalExpenses, { forceParens: true })),
        },
        {
          label: 'Net',
          infoText: 'A recipient has no income to net against, so this is always blank',
          renderCell: () => '—',
        },
      ]}
    />
  )
}
