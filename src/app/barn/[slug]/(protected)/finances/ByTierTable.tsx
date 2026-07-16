'use client'
import { Td } from '@/components/ui/Table'
import { SortableTh } from './SortableTh'
import { ReconciliationFoot } from './ReconciliationFoot'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { FinancialSummary } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type TierRow = FinancialSummary['breakdown'][number]
type SortKey = 'tierName' | 'gross' | 'instructorCut' | 'net'

function getValue(row: TierRow, key: SortKey): string | number {
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
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<TierRow, SortKey>(rows, getValue, 'tierName')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="tierName" label="Tier" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="gross" label="Gross" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="Lesson fees collected this month, before the instructor's cut" />
            <SortableTh sortKey="instructorCut" label="Expenses" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="This tier's own instructor cut" />
            <SortableTh sortKey="net" label="Net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="Gross minus this tier's own instructor cut" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((tier) => (
            <tr key={tier.tierName}>
              <Td>{tier.tierName}</Td>
              <Td>{formatCurrency(tier.subtotal + tier.instructorCut)}</Td>
              <Td>{tier.instructorCut === 0 ? '—' : formatCurrency(tier.instructorCut, { forceParens: true })}</Td>
              <Td>{formatCurrency(tier.subtotal)}</Td>
            </tr>
          ))}
        </tbody>
        <ReconciliationFoot
          labelColSpan={1}
          gross={gross}
          expenses={expenses}
          net={net}
          outsideInfoText="Leases and boarding aren't tied to a lesson tier (Gross); horse expenses aren't tied to a lesson tier (Expenses)."
          unattributedInfoText="An expense whose original record was deleted after being marked paid, with no tier to attribute it to."
        />
      </table>
    </div>
  )
}
