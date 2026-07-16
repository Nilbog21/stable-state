'use client'
import Link from 'next/link'
import { Td } from '@/components/ui/Table'
import { InfoPopover } from './InfoPopover'
import { SortableTh } from './SortableTh'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { RiderIncomeSummary } from '@/lib/db/types'

type SortKey = 'riderName' | 'totalIncome'

function getValue(row: RiderIncomeSummary, key: SortKey): string | number {
  switch (key) {
    case 'riderName':
      return row.riderName
    case 'totalIncome':
      return row.totalIncome
  }
}

export function ByRiderTable({
  rows,
  slug,
  monthParam,
  noRiderLabel,
}: {
  rows: RiderIncomeSummary[]
  slug: string
  monthParam: string
  noRiderLabel: string
}) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<RiderIncomeSummary, SortKey>(rows, getValue, 'riderName')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="riderName" label="Rider" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="totalIncome" label="Net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.riderId}>
              <Td>
                {row.riderId === noRiderLabel ? (
                  <>
                    {row.riderName}
                    <InfoPopover text="Paid lessons with no rider recorded" align="left" />
                  </>
                ) : (
                  <Link href={`/barn/${slug}/finances/riders/${row.riderId}?month=${monthParam}`} className="underline">
                    {row.riderName}
                  </Link>
                )}
              </Td>
              <Td>{formatCurrency(row.totalIncome)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
