'use client'
import { Th } from '@/components/ui/Table'
import { InfoPopover } from './InfoPopover'
import type { SortDir } from './useSortableRows'

// Shared header cell for every breakdown table column (#971) — covers both the sortable
// case (sortKey/activeKey/dir/onSort all provided) and the plain, non-sortable case (e.g.
// By Rider's Expenses, By Paid To's Gross/Net), which otherwise diverged into ad hoc
// <Th>+<InfoPopover> markup per table. The label/button and the info trigger live in one
// inline-flex row so they never wrap onto separate lines regardless of mode.
export function SortableTh<K extends string = string>({
  sortKey,
  label,
  align,
  activeKey,
  dir,
  onSort,
  infoText,
}: {
  sortKey?: K
  label: string
  align?: 'left' | 'right'
  activeKey?: K
  dir?: SortDir
  onSort?: (key: K) => void
  infoText?: string
}) {
  const sortable = sortKey !== undefined && onSort !== undefined
  const active = sortable && activeKey === sortKey
  return (
    <Th align={align} aria-sort={sortable ? (active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none') : undefined}>
      <div className="inline-flex items-center gap-1">
        {sortable ? (
          <button
            type="button"
            onClick={() => onSort!(sortKey!)}
            className="inline-flex min-h-11 items-center gap-1 py-2 uppercase hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {label}
            {active && (dir === 'desc' ? ' ▼' : ' ▲')}
          </button>
        ) : (
          <span className="flex min-h-11 items-center py-2">{label}</span>
        )}
        {infoText && <InfoPopover text={infoText} />}
      </div>
    </Th>
  )
}
