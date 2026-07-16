'use client'
import Link from 'next/link'
import { Td, Th } from '@/components/ui/Table'
import { InfoPopover } from './InfoPopover'
import { SortableTh } from './SortableTh'
import { ReconciliationFoot } from './ReconciliationFoot'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { RiderIncomeSummary } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type SortKey = 'riderName' | 'totalIncome'

function getValue(row: RiderIncomeSummary, key: SortKey): string | number {
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
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<RiderIncomeSummary, SortKey>(rows, getValue, 'riderName')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="riderName" label="Rider" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="totalIncome" label="Gross" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="This rider's lesson and agreement income, before the instructor's cut" />
            <Th>
              Expenses
              <InfoPopover text="No expense is tracked per rider" />
            </Th>
            {/* "Net" reuses the same totalIncome sortKey as "Gross" (they're always equal for
                this table, since no expense is ever rider-attributable) so clicking either
                sorts the same way, rather than introducing a third meaningless sort key. */}
            <SortableTh sortKey="totalIncome" label="Net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="Gross minus this rider's expenses (always zero)" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.riderId}>
              <Td>
                <Link href={`/barn/${slug}/finances/riders/${row.riderId}?month=${monthParam}`} className="underline">
                  {row.riderName}
                </Link>
              </Td>
              <Td>{formatCurrency(row.totalIncome)}</Td>
              <Td>—</Td>
              <Td>{formatCurrency(row.totalIncome)}</Td>
            </tr>
          ))}
        </tbody>
        <ReconciliationFoot
          labelColSpan={1}
          gross={gross}
          expenses={expenses}
          net={net}
          outsideInfoText="Instructor pay and horse expenses aren't tied to a specific rider."
          unattributedInfoText="Paid lessons with no rider recorded, and expense records whose original entry was deleted."
        />
      </table>
    </div>
  )
}
