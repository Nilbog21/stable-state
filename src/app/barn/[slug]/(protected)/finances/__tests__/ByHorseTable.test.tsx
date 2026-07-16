import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ByHorseTable } from '../ByHorseTable'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

afterEach(cleanup)

const rows = [
  { horseId: 'h-2', horseName: 'Zephyr', gross: 100, expenses: 20, net: 80 },
  { horseId: 'h-1', horseName: 'Amber', gross: 50, expenses: 10, net: 40 },
]

const gross: ReconciliationColumn = { subtotal: 150, outside: 0, unattributed: 0, total: 150 }
const expenses: ReconciliationColumn = { subtotal: 30, outside: 25, unattributed: 5, total: 60 }
const net: ReconciliationColumn = { subtotal: 120, outside: -25, unattributed: -5, total: 90 }

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

function renderTable(props: Partial<React.ComponentProps<typeof ByHorseTable>> = {}) {
  return render(<ByHorseTable rows={rows} slug="green-acres" monthParam="2026-06" gross={gross} expenses={expenses} net={net} {...props} />)
}

describe('ByHorseTable', () => {
  it('should_render_uniform_gross_expenses_net_headers', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼ⓘ]/g, '').trim())
    expect(headers).toEqual(['Horse', 'Gross', 'Expenses', 'Net'])
  })

  it('should_default_sort_by_horse_name_ascending', () => {
    const { container } = renderTable()
    expect(rowNames(container)).toEqual(['Amber', 'Zephyr'])
  })

  it('should_flip_to_descending_when_horse_header_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /Horse/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Zephyr', 'Amber'])
  })

  it('should_sort_ascending_by_gross_on_first_click', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Gross/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amber', 'Zephyr'])
  })

  it('should_sort_by_expenses_column_when_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Expenses/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amber', 'Zephyr'])
  })

  it('should_sort_by_net_column_when_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Net/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amber', 'Zephyr'])
  })

  it('should_link_horse_name_to_drilldown_with_month_param', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'Amber' }).getAttribute('href')).toBe('/barn/green-acres/finances/horses/h-1?month=2026-06')
  })

  it('should_not_render_a_no_horse_row_in_the_body', () => {
    renderTable()
    expect(screen.queryByText('No horse')).toBeNull()
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

  it('should_render_expenses_in_accounting_parens', () => {
    renderTable()
    const row = screen.getByText('Amber').closest('tr')!
    expect(row.textContent).toContain('($10.00)')
  })

  it('should_render_a_dash_for_zero_expenses_instead_of_dollar_zero', () => {
    render(<ByHorseTable rows={[{ horseId: 'h-3', horseName: 'Comet', gross: 40, expenses: 0, net: 40 }]} slug="green-acres" monthParam="2026-06" gross={gross} expenses={expenses} net={net} />)
    const row = screen.getByText('Comet').closest('tr')!
    const expensesCell = row.querySelectorAll('td')[2]
    expect(expensesCell.textContent).toBe('—')
  })
})
