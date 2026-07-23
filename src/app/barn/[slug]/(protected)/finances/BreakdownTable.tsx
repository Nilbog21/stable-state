'use client'
import type { ReactNode } from 'react'
import { Td } from '@/components/ui/Table'
import { SortableTh } from './SortableTh'
import { ReconciliationFoot } from './ReconciliationFoot'
import { useSortableRows } from './useSortableRows'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type BreakdownColumn<Row, K extends string> = {
  sortKey?: K
  label: string
  infoText?: string
  renderCell: (row: Row) => ReactNode
}

// #981: shared table shell for the 5 Finances breakdown tables — see SortableTh,
// ReconciliationFoot, useSortableRows (#971). Each caller supplies row data, a sort-key
// enum + value extractor, and a column-definition array; this owns the useSortableRows
// call, the <table> markup, and the ReconciliationFoot wiring.
export function BreakdownTable<Row, K extends string>({
  rows,
  rowKey,
  defaultSortKey,
  getSortValue,
  columns,
  gross,
  expenses,
  net,
  outsideInfoText,
  unattributedInfoText,
}: {
  rows: Row[]
  rowKey: (row: Row) => string
  defaultSortKey: K
  getSortValue: (row: Row, key: K) => string | number
  columns: BreakdownColumn<Row, K>[]
  gross: ReconciliationColumn | null
  expenses: ReconciliationColumn | null
  net: ReconciliationColumn | null
  outsideInfoText: string
  unattributedInfoText: string
}) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<Row, K>(rows, getSortValue, defaultSortKey)

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <SortableTh
                key={i}
                sortKey={col.sortKey}
                label={col.label}
                activeKey={sortKey}
                dir={sortDir}
                onSort={col.sortKey !== undefined ? toggleSort : undefined}
                infoText={col.infoText}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col, i) => (
                <Td key={i}>{col.renderCell(row)}</Td>
              ))}
            </tr>
          ))}
        </tbody>
        <ReconciliationFoot
          labelColSpan={1}
          gross={gross}
          expenses={expenses}
          net={net}
          outsideInfoText={outsideInfoText}
          unattributedInfoText={unattributedInfoText}
        />
      </table>
    </div>
  )
}
