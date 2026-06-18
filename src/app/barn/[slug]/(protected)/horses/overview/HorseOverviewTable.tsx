'use client'

import { useState } from 'react'
import type { HorseExertionSummary } from '@/lib/db/types'

type SortKey = 'name' | 'totalExertion' | 'jumpingCount' | 'lessonCount'

const COLUMNS: { key: SortKey; label: string; tdClassName: string }[] = [
  { key: 'name', label: 'Horse', tdClassName: 'py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50' },
  { key: 'totalExertion', label: 'Total Exertion (7d)', tdClassName: 'py-3 pr-6 text-sm text-zinc-700 dark:text-zinc-300' },
  { key: 'jumpingCount', label: '# Jumping (7d)', tdClassName: 'py-3 pr-6 text-sm text-zinc-700 dark:text-zinc-300' },
  { key: 'lessonCount', label: 'Lessons (7d)', tdClassName: 'py-3 text-sm text-zinc-700 dark:text-zinc-300' },
]

export function HorseOverviewTable({ horses }: { horses: HorseExertionSummary[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'totalExertion',
    dir: 'desc',
  })

  if (horses.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">No horses in this barn.</p>
  }

  function handleHeaderClick(key: SortKey) {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    )
  }

  const sorted = [...horses].sort((a, b) => {
    const aVal = a[sort.key]
    const bVal = b[sort.key]
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sort.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sort.dir === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {COLUMNS.map(col => (
            <th
              key={col.key}
              className="pb-2 pr-6"
              aria-sort={sort.key === col.key ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
            >
              <button
                type="button"
                onClick={() => handleHeaderClick(col.key)}
                className="flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                {col.label}
                {sort.key === col.key && (sort.dir === 'desc' ? ' ▼' : ' ▲')}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(horse => (
          <tr key={horse.id} className="border-b border-zinc-100 dark:border-zinc-800">
            {COLUMNS.map(col => (
              <td key={col.key} className={col.tdClassName}>{horse[col.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
