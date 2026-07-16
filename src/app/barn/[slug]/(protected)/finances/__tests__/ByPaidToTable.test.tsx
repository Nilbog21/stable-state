import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ByPaidToTable } from '../ByPaidToTable'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

afterEach(cleanup)

const rows = [
  { recipient: 'Zoe Vet', totalExpenses: 100 },
  { recipient: 'Alice Farrier', totalExpenses: 50 },
]

const expenses: ReconciliationColumn = { subtotal: 150, outside: 5, unattributed: 10, total: 165 }

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

function renderTable(props: Partial<React.ComponentProps<typeof ByPaidToTable>> = {}) {
  return render(<ByPaidToTable rows={rows} slug="green-acres" monthParam="2026-06" expenses={expenses} {...props} />)
}

describe('ByPaidToTable', () => {
  it('should_render_uniform_gross_expenses_net_headers', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼ⓘ]/g, '').trim())
    expect(headers).toEqual(['Recipient', 'Gross', 'Expenses', 'Net'])
  })

  it('should_render_a_dash_in_the_gross_and_net_cells_for_every_row', () => {
    renderTable()
    const row = screen.getByText('Alice Farrier').closest('tr')!
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Alice Farrier', '—', '$50.00', '—'])
  })

  it('should_default_sort_by_recipient_name_ascending', () => {
    const { container } = renderTable()
    expect(rowNames(container)).toEqual(['Alice Farrier', 'Zoe Vet'])
  })

  it('should_flip_to_descending_when_recipient_header_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /Recipient/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Zoe Vet', 'Alice Farrier'])
  })

  it('should_sort_ascending_by_expenses_on_first_click', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Expenses/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Alice Farrier', 'Zoe Vet'])
  })

  it('should_link_recipient_name_to_drilldown_with_month_param', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'Alice Farrier' }).getAttribute('href')).toBe('/barn/green-acres/finances/expenses/Alice%20Farrier?month=2026-06')
  })

  it('should_render_a_tfoot_reconciliation_footer_with_dashed_gross_and_net', () => {
    renderTable()
    const totalRow = screen.getByText('Total').closest('tr')!
    const cells = Array.from(totalRow.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Total', '—', '$165.00', '—'])
  })

  it('should_exclude_the_footer_from_the_sortable_tbody', () => {
    const { container } = renderTable()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  })
})
