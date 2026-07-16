'use client'
import { Td } from '@/components/ui/Table'
import { InfoPopover } from './InfoPopover'
import { SortableTh } from './SortableTh'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { FinancialSummary } from '@/lib/db/types'

type TierRow = FinancialSummary['breakdown'][number]
type SortKey = 'tierName' | 'price' | 'lessonCount' | 'gross' | 'instructorCut' | 'net'

function getValue(row: TierRow, key: SortKey): string | number {
  switch (key) {
    case 'tierName':
      return row.tierName
    case 'price':
      return row.price ?? -Infinity
    case 'lessonCount':
      return row.lessonCount
    case 'gross':
      return row.subtotal + row.instructorCut
    case 'instructorCut':
      return row.instructorCut
    case 'net':
      return row.subtotal
  }
}

export function ByTierTable({ rows, nonLessonIncomeLabel }: { rows: TierRow[]; nonLessonIncomeLabel: string }) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<TierRow, SortKey>(rows, getValue, 'tierName')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="tierName" label="Tier" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="price" label="Price" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="lessonCount" label="Lessons" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="gross" label="Gross" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="instructorCut" label="Instructor Cut" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="net" label="Net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {/* tierName === nonLessonIncomeLabel assumes no real tier is ever named "Non-lesson income" — same assumption ByHorseTable/ByRiderTable/ByInstructorTable make for their own NO_HORSE_LABEL/NO_RIDER_LABEL/NO_INSTRUCTOR_LABEL */}
          {sorted.map((tier) => (
            <tr key={tier.tierName}>
              <Td>
                {tier.tierName}
                {tier.tierName === nonLessonIncomeLabel && <InfoPopover text="Includes leases and boarding" align="left" />}
              </Td>
              <Td>{tier.price != null ? tier.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—'}</Td>
              <Td>{tier.tierName === nonLessonIncomeLabel ? '' : tier.lessonCount}</Td>
              <Td>{formatCurrency(tier.subtotal + tier.instructorCut)}</Td>
              <Td>{tier.instructorCut === 0 ? '—' : formatCurrency(tier.instructorCut, { forceParens: true })}</Td>
              <Td>{formatCurrency(tier.subtotal)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
