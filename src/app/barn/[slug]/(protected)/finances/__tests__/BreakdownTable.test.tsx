import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { BreakdownTable } from '../BreakdownTable'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

afterEach(cleanup)

type Row = { id: string; name: string; value: number }
type SortKey = 'name' | 'value'

const rows: Row[] = [
  { id: 'b', name: 'Zoe', value: 10 },
  { id: 'a', name: 'Alice', value: 20 },
]

const gross: ReconciliationColumn = { subtotal: 30, outside: 1, unattributed: 2, total: 33 }

function getSortValue(row: Row, key: SortKey) {
  return row[key]
}

function renderTable(props: Partial<React.ComponentProps<typeof BreakdownTable<Row, SortKey>>> = {}) {
  return render(
    <BreakdownTable<Row, SortKey>
      rows={rows}
      rowKey={(row) => row.id}
      defaultSortKey="name"
      getSortValue={getSortValue}
      gross={gross}
      expenses={gross}
      net={gross}
      outsideInfoText="outside info"
      unattributedInfoText="unattributed info"
      columns={[
        { sortKey: 'name', label: 'Name', renderCell: (row) => row.name },
        { sortKey: 'value', label: 'Value', renderCell: (row) => String(row.value) },
        { label: 'Note', renderCell: () => 'fixed' },
      ]}
      {...props}
    />,
  )
}

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

describe('BreakdownTable', () => {
  it('should_default_sort_by_the_given_default_sort_key', () => {
    const { container } = renderTable()
    expect(rowNames(container)).toEqual(['Alice', 'Zoe'])
  })

  it('should_sort_by_a_different_column_when_its_header_is_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: 'Value' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Zoe', 'Alice'])
  })

  it('should_not_render_a_sort_button_for_a_column_with_no_sort_key', () => {
    renderTable()
    const noteHeader = screen.getByRole('columnheader', { name: 'Note' })
    expect(noteHeader.querySelector('button')).toBeNull()
  })

  it('should_render_each_columns_cell_via_its_render_cell_function', () => {
    renderTable()
    const row = screen.getByText('Alice').closest('tr')!
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Alice', '20', 'fixed'])
  })

  it('should_render_a_tfoot_reconciliation_footer', () => {
    renderTable()
    const totalRow = screen.getByText('Total').closest('tr')!
    expect(totalRow.querySelectorAll('td')).toHaveLength(4)
  })

  it('should_exclude_the_footer_from_the_sortable_tbody', () => {
    const { container } = renderTable()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  })
})
