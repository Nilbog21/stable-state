'use client'
import Link from 'next/link'
import { Td } from '@/components/ui/Table'
import { SortableTh } from './SortableTh'
import { ReconciliationFoot } from './ReconciliationFoot'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { TrainerIncomeSummary } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type SortKey = 'trainerName' | 'grossIncome' | 'instructorCut' | 'totalIncome'

function getValue(row: TrainerIncomeSummary, key: SortKey): string | number {
  switch (key) {
    case 'trainerName':
      return row.trainerName
    case 'grossIncome':
      return row.grossIncome ?? -Infinity
    case 'instructorCut':
      return row.grossIncome != null ? row.grossIncome - row.totalIncome : -Infinity
    case 'totalIncome':
      return row.totalIncome
  }
}

export function ByInstructorTable({
  rows,
  slug,
  monthParam,
  gross,
  expenses,
  net,
}: {
  rows: TrainerIncomeSummary[]
  slug: string
  monthParam: string
  gross: ReconciliationColumn
  expenses: ReconciliationColumn
  net: ReconciliationColumn
}) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<TrainerIncomeSummary, SortKey>(rows, getValue, 'trainerName')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="trainerName" label="Trainer" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="grossIncome" label="Gross" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="Lesson fees collected this month, before this instructor's cut" />
            <SortableTh sortKey="instructorCut" label="Expenses" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="This instructor's own cut" />
            <SortableTh sortKey="totalIncome" label="Net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} infoText="Gross minus this instructor's own cut" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.trainerId}>
              <Td>
                <Link href={`/barn/${slug}/finances/trainers/${row.trainerId}?month=${monthParam}`} className="underline">
                  {row.trainerName}
                </Link>
              </Td>
              <Td>{row.grossIncome != null ? formatCurrency(row.grossIncome) : '—'}</Td>
              <Td>{row.grossIncome != null ? formatCurrency(row.grossIncome - row.totalIncome, { forceParens: true }) : '—'}</Td>
              <Td>{formatCurrency(row.totalIncome)}</Td>
            </tr>
          ))}
        </tbody>
        <ReconciliationFoot
          labelColSpan={1}
          gross={gross}
          expenses={expenses}
          net={net}
          outsideInfoText="Leases and boarding aren't tied to an instructor (Gross); horse expenses aren't tied to an instructor (Expenses)."
          unattributedInfoText="A paid lesson with no instructor recorded, an instructor payout whose instructor was removed from the barn, or an expense record whose original entry was deleted after being marked paid."
        />
      </table>
    </div>
  )
}
