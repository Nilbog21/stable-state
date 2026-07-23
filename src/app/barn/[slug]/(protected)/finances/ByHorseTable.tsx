'use client'
import Link from 'next/link'
import { BreakdownTable } from './BreakdownTable'
import { formatCurrency } from '@/lib/format-currency'
import type { HorseNetIncomeRow } from '@/lib/db/types'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

type SortKey = 'horseName' | 'gross' | 'expenses' | 'net'

function getSortValue(row: HorseNetIncomeRow, key: SortKey): string | number {
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
  return (
    <BreakdownTable<HorseNetIncomeRow, SortKey>
      rows={rows}
      rowKey={(row) => row.horseId}
      defaultSortKey="horseName"
      getSortValue={getSortValue}
      gross={gross}
      expenses={expenses}
      net={net}
      outsideInfoText="Instructor pay isn't tied to a specific horse."
      unattributedInfoText="A paid lesson with no horse recorded, or an expense record whose original entry was deleted after being marked paid — never a barn-wide expense split across horses, which appears in each horse's own row instead."
      columns={[
        {
          sortKey: 'horseName',
          label: 'Horse',
          renderCell: (row) => (
            <Link href={`/barn/${slug}/finances/horses/${row.horseId}?month=${monthParam}`} className="underline">
              {row.horseName}
            </Link>
          ),
        },
        {
          sortKey: 'gross',
          label: 'Gross',
          infoText: "This horse's lesson and agreement income, before the instructor's cut",
          renderCell: (row) => formatCurrency(row.gross),
        },
        {
          sortKey: 'expenses',
          label: 'Expenses',
          infoText: "This horse's own vet, farrier, and other costs",
          renderCell: (row) => (row.expenses === 0 ? '—' : formatCurrency(row.expenses, { forceParens: true })),
        },
        {
          sortKey: 'net',
          label: 'Net',
          infoText: "Gross minus this horse's own expenses",
          renderCell: (row) => formatCurrency(row.net),
        },
      ]}
    />
  )
}
