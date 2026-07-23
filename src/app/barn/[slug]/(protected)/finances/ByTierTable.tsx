'use client'
import { BreakdownTable } from './BreakdownTable'
import { formatCurrency } from '@/lib/format-currency'
import type { FinancialSummary } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type TierRow = FinancialSummary['breakdown'][number]
type SortKey = 'tierName' | 'gross' | 'instructorCut' | 'net'

function getSortValue(row: TierRow, key: SortKey): string | number {
  switch (key) {
    case 'tierName':
      return row.tierName
    case 'gross':
      return row.subtotal + row.instructorCut
    case 'instructorCut':
      return row.instructorCut
    case 'net':
      return row.subtotal
  }
}

export function ByTierTable({
  rows,
  gross,
  expenses,
  net,
}: {
  rows: TierRow[]
  gross: ReconciliationColumn
  expenses: ReconciliationColumn
  net: ReconciliationColumn
}) {
  return (
    <BreakdownTable<TierRow, SortKey>
      rows={rows}
      rowKey={(row) => row.tierName}
      defaultSortKey="tierName"
      getSortValue={getSortValue}
      gross={gross}
      expenses={expenses}
      net={net}
      outsideInfoText="Leases and boarding aren't tied to a lesson tier (Gross); horse expenses aren't tied to a lesson tier (Expenses)."
      unattributedInfoText="An expense record whose original entry was deleted after being marked paid — every other expense counts under Outside this view instead, since a tier has no expense concept of its own."
      columns={[
        { sortKey: 'tierName', label: 'Tier', renderCell: (row) => row.tierName },
        {
          sortKey: 'gross',
          label: 'Gross',
          infoText: "Lesson fees collected this month, before the instructor's cut",
          renderCell: (row) => formatCurrency(row.subtotal + row.instructorCut),
        },
        {
          sortKey: 'instructorCut',
          label: 'Expenses',
          infoText: "This tier's own instructor cut",
          renderCell: (row) => (row.instructorCut === 0 ? '—' : formatCurrency(row.instructorCut, { forceParens: true })),
        },
        {
          sortKey: 'net',
          label: 'Net',
          infoText: "Gross minus this tier's own instructor cut",
          renderCell: (row) => formatCurrency(row.subtotal),
        },
      ]}
    />
  )
}
