import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSortableRows } from '../useSortableRows'

type Row = { name: string; value: number }

const rows: Row[] = [
  { name: 'Beta', value: 20 },
  { name: 'Alpha', value: 10 },
  { name: 'Gamma', value: 30 },
]

function getValue(row: Row, key: 'name' | 'value') {
  return row[key]
}

describe('useSortableRows', () => {
  it('should_sort_by_default_key_ascending_on_mount', () => {
    const { result } = renderHook(() => useSortableRows(rows, getValue, 'name'))
    expect(result.current.sorted.map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('should_report_default_key_as_active_sort_key', () => {
    const { result } = renderHook(() => useSortableRows(rows, getValue, 'name'))
    expect(result.current.sortKey).toBe('name')
  })

  it('should_report_ascending_as_default_direction', () => {
    const { result } = renderHook(() => useSortableRows(rows, getValue, 'name'))
    expect(result.current.sortDir).toBe('asc')
  })

  it('should_sort_ascending_on_first_click_of_a_new_column', () => {
    const { result } = renderHook(() => useSortableRows(rows, getValue, 'name'))
    act(() => result.current.toggleSort('value'))
    expect(result.current.sorted.map((r) => r.value)).toEqual([10, 20, 30])
  })

  it('should_flip_to_descending_on_second_click_of_same_column', () => {
    const { result } = renderHook(() => useSortableRows(rows, getValue, 'name'))
    act(() => result.current.toggleSort('name'))
    act(() => result.current.toggleSort('name'))
    expect(result.current.sortDir).toBe('desc')
  })

  it('should_reverse_row_order_when_direction_flips_to_descending', () => {
    const { result } = renderHook(() => useSortableRows(rows, getValue, 'name'))
    act(() => result.current.toggleSort('name'))
    act(() => result.current.toggleSort('name'))
    expect(result.current.sorted.map((r) => r.name)).toEqual(['Gamma', 'Beta', 'Alpha'])
  })

  it('should_reset_to_ascending_when_switching_from_a_descending_column_to_a_new_column', () => {
    const { result } = renderHook(() => useSortableRows(rows, getValue, 'name'))
    act(() => result.current.toggleSort('name'))
    act(() => result.current.toggleSort('name'))
    act(() => result.current.toggleSort('value'))
    expect(result.current.sortDir).toBe('asc')
  })
})
