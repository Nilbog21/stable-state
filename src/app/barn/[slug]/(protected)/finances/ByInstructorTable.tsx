'use client'
import Link from 'next/link'
import { BreakdownTable } from './BreakdownTable'
import { formatCurrency } from '@/lib/format-currency'
import type { TrainerIncomeSummary } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type SortKey = 'trainerName' | 'grossIncome' | 'instructorCut' | 'totalIncome'

function getSortValue(row: TrainerIncomeSummary, key: SortKey): string | number {
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
  return (
    <BreakdownTable<TrainerIncomeSummary, SortKey>
      rows={rows}
      rowKey={(row) => row.trainerId}
      defaultSortKey="trainerName"
      getSortValue={getSortValue}
      gross={gross}
      expenses={expenses}
      net={net}
      outsideInfoText="Leases and boarding aren't tied to an instructor (Gross); horse expenses aren't tied to an instructor (Expenses)."
      unattributedInfoText="A paid lesson with no instructor recorded, an instructor payout whose instructor was removed from the barn, or an expense record whose original entry was deleted after being marked paid."
      columns={[
        {
          sortKey: 'trainerName',
          label: 'Trainer',
          renderCell: (row) => (
            <Link href={`/barn/${slug}/finances/trainers/${row.trainerId}?month=${monthParam}`} className="underline">
              {row.trainerName}
            </Link>
          ),
        },
        {
          sortKey: 'grossIncome',
          label: 'Gross',
          infoText: "Lesson fees collected this month, before this instructor's cut",
          renderCell: (row) => (row.grossIncome != null ? formatCurrency(row.grossIncome) : '—'),
        },
        {
          sortKey: 'instructorCut',
          label: 'Expenses',
          infoText: "This instructor's own cut",
          renderCell: (row) =>
            row.grossIncome != null
              ? row.grossIncome - row.totalIncome === 0
                ? '—'
                : formatCurrency(row.grossIncome - row.totalIncome, { forceParens: true })
              : '—',
        },
        {
          sortKey: 'totalIncome',
          label: 'Net',
          infoText: "Gross minus this instructor's own cut",
          renderCell: (row) => formatCurrency(row.totalIncome),
        },
      ]}
    />
  )
}
