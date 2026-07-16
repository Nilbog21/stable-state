'use client'
import { Th } from '@/components/ui/Table'
import type { SortDir } from './useSortableRows'

export function SortableTh<K extends string,>({
  sortKey,
  label,
  align,
  activeKey,
  dir,
  onSort,
}: {
  sortKey: K
  label: string
  align?: 'left' | 'right'
  activeKey: K
  dir: SortDir
  onSort: (key: K) => void
}) {
  const active = activeKey === sortKey
  return (
    <Th align={align} aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        {label}
        {active && (dir === 'desc' ? ' ▼' : ' ▲')}
      </button>
    </Th>
  )
}
