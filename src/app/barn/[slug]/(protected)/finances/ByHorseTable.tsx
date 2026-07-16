'use client'
import Link from 'next/link'
import { Td } from '@/components/ui/Table'
import { InfoPopover } from './InfoPopover'
import { SortableTh } from './SortableTh'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { HorseNetIncomeRow } from '@/lib/db/types'

type SortKey = 'horseName' | 'income' | 'expenses' | 'net'

function getValue(row: HorseNetIncomeRow, key: SortKey): string | number {
  switch (key) {
    case 'horseName':
      return row.horseName
    case 'income':
      return row.income
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
  noHorseLabel,
}: {
  rows: HorseNetIncomeRow[]
  slug: string
  monthParam: string
  noHorseLabel: string
}) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<HorseNetIncomeRow, SortKey>(rows, getValue, 'horseName')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="horseName" label="Horse" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="income" label="Gross" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="expenses" label="Expenses" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="net" label="Net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.horseId}>
              <Td>
                {row.horseId === noHorseLabel ? (
                  <>
                    {row.horseName}
                    <InfoPopover text="Paid lessons with no horse recorded" align="left" />
                  </>
                ) : (
                  <Link href={`/barn/${slug}/finances/horses/${row.horseId}?month=${monthParam}`} className="underline">
                    {row.horseName}
                  </Link>
                )}
              </Td>
              <Td>{formatCurrency(row.income)}</Td>
              <Td>{formatCurrency(row.expenses)}</Td>
              <Td>{formatCurrency(row.net)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
