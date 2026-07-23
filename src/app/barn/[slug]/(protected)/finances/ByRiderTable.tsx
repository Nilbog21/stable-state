'use client'
import Link from 'next/link'
import { BreakdownTable } from './BreakdownTable'
import { formatCurrency } from '@/lib/format-currency'
import type { RiderIncomeSummary } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type SortKey = 'riderName' | 'totalIncome'

function getSortValue(row: RiderIncomeSummary, key: SortKey): string | number {
  switch (key) {
    case 'riderName':
      return row.riderName
    case 'totalIncome':
      return row.totalIncome
  }
}

// #971: RiderIncomeSummary.totalIncome is gross (pre-cut, via RIDER_INCOME_DESCRIPTOR's
// splitsGrossFee). No expense is ever attributable to a specific rider (instructor cut and
// horse expenses are both "outside this view" for this table), so every row's Expenses is
// zero and Net always equals Gross.
export function ByRiderTable({
  rows,
  slug,
  monthParam,
  gross,
  expenses,
  net,
}: {
  rows: RiderIncomeSummary[]
  slug: string
  monthParam: string
  gross: ReconciliationColumn
  expenses: ReconciliationColumn
  net: ReconciliationColumn
}) {
  return (
    <BreakdownTable<RiderIncomeSummary, SortKey>
      rows={rows}
      rowKey={(row) => row.riderId}
      defaultSortKey="riderName"
      getSortValue={getSortValue}
      gross={gross}
      expenses={expenses}
      net={net}
      outsideInfoText="Instructor pay and horse expenses aren't tied to a specific rider."
      unattributedInfoText="A paid lesson with no rider recorded, or an expense record whose original entry was deleted after being marked paid."
      columns={[
        {
          sortKey: 'riderName',
          label: 'Rider',
          renderCell: (row) => (
            <Link href={`/barn/${slug}/finances/riders/${row.riderId}?month=${monthParam}`} className="underline">
              {row.riderName}
            </Link>
          ),
        },
        {
          sortKey: 'totalIncome',
          label: 'Gross',
          infoText: "This rider's lesson and agreement income, before the instructor's cut",
          renderCell: (row) => formatCurrency(row.totalIncome),
        },
        {
          label: 'Expenses',
          infoText: 'No expense is tracked per rider',
          renderCell: () => '—',
        },
        // "Net" reuses the same totalIncome sortKey as "Gross" (they're always equal for
        // this table, since no expense is ever rider-attributable) so clicking either
        // sorts the same way, rather than introducing a third meaningless sort key.
        {
          sortKey: 'totalIncome',
          label: 'Net',
          infoText: "Gross minus this rider's expenses (always zero)",
          renderCell: (row) => formatCurrency(row.totalIncome),
        },
      ]}
    />
  )
}
