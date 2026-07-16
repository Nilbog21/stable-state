import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'

export function useSortableRows<T, K extends string>(
  rows: T[],
  getValue: (row: T, key: K) => string | number,
  defaultKey: K
) {
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: defaultKey, dir: 'asc' })

  function toggleSort(key: K) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = getValue(a, sort.key)
      const bv = getValue(b, sort.key)
      if (typeof av === 'string' && typeof bv === 'string') {
        return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sort.dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [rows, sort, getValue])

  return { sorted, sortKey: sort.key, sortDir: sort.dir, toggleSort }
}
