import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ByRiderTable } from '../ByRiderTable'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

afterEach(cleanup)

const rows = [
  { riderId: 'r-2', riderName: 'Zoe', totalIncome: 100 },
  { riderId: 'r-1', riderName: 'Amy', totalIncome: 50 },
]

const gross: ReconciliationColumn = { subtotal: 150, outside: 0, unattributed: 0, total: 150 }
const expenses: ReconciliationColumn = { subtotal: 0, outside: 55, unattributed: 5, total: 60 }
const net: ReconciliationColumn = { subtotal: 150, outside: -55, unattributed: -5, total: 90 }

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

function renderTable(props: Partial<React.ComponentProps<typeof ByRiderTable>> = {}) {
  return render(<ByRiderTable rows={rows} slug="green-acres" monthParam="2026-06" gross={gross} expenses={expenses} net={net} {...props} />)
}

describe('ByRiderTable', () => {
  it('should_render_uniform_gross_expenses_net_headers', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼ⓘ]/g, '').trim())
    expect(headers).toEqual(['Rider', 'Gross', 'Expenses', 'Net'])
  })

  it('should_render_a_dash_for_the_always_zero_per_row_expenses_cell', () => {
    renderTable()
    const row = screen.getByText('Amy').closest('tr')!
    expect(row.textContent).toContain('—')
  })

  it('should_render_net_equal_to_gross_since_expenses_is_always_zero_per_row', () => {
    renderTable()
    const row = screen.getByText('Amy').closest('tr')!
    // gross $50.00 appears twice: once under Gross, once under Net
    expect(row.textContent?.match(/\$50\.00/g)?.length).toBe(2)
  })

  it('should_default_sort_by_rider_name_ascending', () => {
    const { container } = renderTable()
    expect(rowNames(container)).toEqual(['Amy', 'Zoe'])
  })

  it('should_sort_by_gross_column_when_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Gross/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amy', 'Zoe'])
  })

  it('should_link_rider_name_to_drilldown_with_month_param', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'Amy' }).getAttribute('href')).toBe('/barn/green-acres/finances/riders/r-1?month=2026-06')
  })

  it('should_not_render_a_no_rider_row_in_the_body', () => {
    renderTable()
    expect(screen.queryByText('No rider')).toBeNull()
  })

  it('should_render_a_tfoot_reconciliation_footer', () => {
    const { container } = renderTable()
    expect(container.querySelector('tfoot')).not.toBeNull()
  })

  it('should_render_the_footer_total_row_matching_the_gross_expenses_net_totals', () => {
    renderTable()
    const totalRow = screen.getByText('Total').closest('tr')!
    const cells = Array.from(totalRow.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Total', '$150.00', '($60.00)', '$90.00'])
  })

  it('should_exclude_the_footer_from_the_sortable_tbody', () => {
    const { container } = renderTable()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  })
})
