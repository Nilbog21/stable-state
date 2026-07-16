'use client'
import { Th } from '@/components/ui/Table'
import { InfoPopover } from './InfoPopover'
import type { SortDir } from './useSortableRows'

export function SortableTh<K extends string,>({
  sortKey,
  label,
  align,
  activeKey,
  dir,
  onSort,
  infoText,
}: {
  sortKey: K
  label: string
  align?: 'left' | 'right'
  activeKey: K
  dir: SortDir
  onSort: (key: K) => void
  infoText?: string
}) {
  const active = activeKey === sortKey
  return (
    <Th align={align} aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex min-h-11 items-center gap-1 py-2 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {label}
        {active && (dir === 'desc' ? ' ▼' : ' ▲')}
      </button>
      {infoText && <InfoPopover text={infoText} />}
    </Th>
  )
}
