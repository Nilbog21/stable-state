'use client'
import Link from 'next/link'
import { Td } from '@/components/ui/Table'
import { InfoPopover } from './InfoPopover'
import { SortableTh } from './SortableTh'
import { useSortableRows } from './useSortableRows'
import { formatCurrency } from '@/lib/format-currency'
import type { TrainerIncomeSummary } from '@/lib/db/types'

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
  nonLessonIncomeLabel,
  noInstructorLabel,
}: {
  rows: TrainerIncomeSummary[]
  slug: string
  monthParam: string
  nonLessonIncomeLabel: string
  noInstructorLabel: string
}) {
  const { sorted, sortKey, sortDir, toggleSort } = useSortableRows<TrainerIncomeSummary, SortKey>(rows, getValue, 'trainerName')

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <SortableTh sortKey="trainerName" label="Trainer" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="grossIncome" label="Gross" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="instructorCut" label="Instructor Cut" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableTh sortKey="totalIncome" label="Net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.trainerId}>
              <Td>
                {row.trainerId === nonLessonIncomeLabel || row.trainerId === noInstructorLabel ? (
                  <>
                    {row.trainerName}
                    {row.trainerId === nonLessonIncomeLabel && <InfoPopover text="Includes leases and boarding" align="left" />}
                    {row.trainerId === noInstructorLabel && <InfoPopover text="Lessons whose instructor was removed from the barn" align="left" />}
                  </>
                ) : (
                  <Link href={`/barn/${slug}/finances/trainers/${row.trainerId}?month=${monthParam}`} className="underline">
                    {row.trainerName}
                  </Link>
                )}
              </Td>
              <Td>{row.grossIncome != null ? formatCurrency(row.grossIncome) : '—'}</Td>
              <Td>{row.grossIncome != null ? formatCurrency(row.grossIncome - row.totalIncome, { forceParens: true }) : '—'}</Td>
              <Td>{formatCurrency(row.totalIncome)}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
