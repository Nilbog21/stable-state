'use client'
import Link from 'next/link'
import { Td } from '@/components/ui/Table'
import { SortableTh } from './SortableTh'
import { ReconciliationFoot } from './ReconciliationFoot'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { HorseNetIncomeRow } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type SortKey = 'horseName' | 'gross' | 'expenses' | 'net'

function getValue(row: HorseNetIncomeRow, key: SortKey): string | number {
  switch (key) {
    case 'horseName':
      return row.horseName
    case 'gross':
      return row.gross
    case 'expenses':
      return row.expenses
    case 'net':
      return row.net
  }
}

export function ByHorseTable({
  rows,
  slug,
  monthParam,
  gross,
  expenses,
  net,
}: {
  rows: HorseNetIncomeRow[]
  slug: string
  monthParam: string
  gross: ReconciliationColumn
  expenses: ReconciliationColumn
  net: ReconciliationColumn
}) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<HorseNetIncomeRow, SortKey>(rows, getValue, 'horseName')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="horseName" label="Horse" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="gross" label="Gross" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="This horse's lesson and agreement income, before the instructor's cut" />
            <SortableTh sortKey="expenses" label="Expenses" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="This horse's own vet, farrier, and other costs" />
            <SortableTh sortKey="net" label="Net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="Gross minus this horse's own expenses" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.horseId}>
              <Td>
                <Link href={`/barn/${slug}/finances/horses/${row.horseId}?month=${monthParam}`} className="underline">
                  {row.horseName}
                </Link>
              </Td>
              <Td>{formatCurrency(row.gross)}</Td>
              <Td>{row.expenses === 0 ? '—' : formatCurrency(row.expenses, { forceParens: true })}</Td>
              <Td>{formatCurrency(row.net)}</Td>
            </tr>
          ))}
        </tbody>
        <ReconciliationFoot
          labelColSpan={1}
          gross={gross}
          expenses={expenses}
          net={net}
          outsideInfoText="Instructor pay isn't tied to a specific horse."
          unattributedInfoText="Paid lessons with no horse recorded, and expense records whose original entry was deleted."
        />
      </table>
    </div>
  )
}
