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

export function HorseOverviewTable({
  horses,
  isManager = false,
}: {
  horses: HorseExertionSummary[]
  isManager?: boolean
}) {
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
          {isManager && <th className="pb-2">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {sorted.map(horse => (
          <tr key={horse.id} className="border-b border-zinc-100 dark:border-zinc-800">
            <td className={COLUMNS[0].tdClassName}>
              {isManager ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    name="name"
                    form={`update-horse-${horse.id}`}
                    defaultValue={horse.name}
                    required
                    className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                  {!horse.is_active && (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                      Inactive
                    </span>
                  )}
                </div>
              ) : (
                <>
                  {horse.name}
                  {!horse.is_active && (
                    <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                      Inactive
                    </span>
                  )}
                </>
              )}
            </td>
            {COLUMNS.slice(1).map(col => (
              <td key={col.key} className={col.tdClassName}>{horse[col.key]}</td>
            ))}
            {isManager && (
              <td className="py-3">
                <div className="flex gap-2">
                  <button
                    type="submit"
                    form={`update-horse-${horse.id}`}
                    className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Save
                  </button>
                  {horse.is_active ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Set ${horse.name} inactive?`)) {
                          (document.getElementById(`toggle-horse-${horse.id}`) as HTMLFormElement)?.requestSubmit()
                        }
                      }}
                      className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
                    >
                      Set Inactive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        (document.getElementById(`toggle-horse-${horse.id}`) as HTMLFormElement)?.requestSubmit()
                      }}
                      className="rounded bg-green-700 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                    >
                      Set Active
                    </button>
                  )}
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
