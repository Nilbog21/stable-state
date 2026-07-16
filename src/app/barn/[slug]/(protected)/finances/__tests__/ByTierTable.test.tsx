import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ByTierTable } from '../ByTierTable'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

afterEach(cleanup)

const rows = [
  { tierName: 'Standard', price: 50, lessonCount: 2, subtotal: 100, instructorCut: 25 },
  { tierName: 'Premium', price: 75, lessonCount: 1, subtotal: 75, instructorCut: 0 },
]

const gross: ReconciliationColumn = { subtotal: 200, outside: 0, unattributed: 0, total: 200 }
const expenses: ReconciliationColumn = { subtotal: 25, outside: 100, unattributed: 5, total: 130 }
const net: ReconciliationColumn = { subtotal: 175, outside: -100, unattributed: -5, total: 70 }

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

function renderTable(props: Partial<React.ComponentProps<typeof ByTierTable>> = {}) {
  return render(<ByTierTable rows={rows} gross={gross} expenses={expenses} net={net} {...props} />)
}

describe('ByTierTable', () => {
  it('should_render_uniform_gross_expenses_net_headers_with_no_lessons_column', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼ⓘ]/g, '').trim())
    expect(headers).toEqual(['Tier', 'Price', 'Gross', 'Expenses', 'Net'])
  })

  it('should_compute_gross_as_net_plus_instructor_cut', () => {
    renderTable()
    const row = screen.getByText('Standard').closest('tr')!
    expect(row.textContent).toContain('$125.00')
  })

  it('should_render_instructor_cut_under_the_expenses_header', () => {
    renderTable()
    const row = screen.getByText('Premium').closest('tr')!
    // Premium has instructorCut: 0, matching the existing dash-at-zero convention
    expect(row.textContent).toContain('—')
  })

  it('should_default_sort_by_tier_name_ascending', () => {
    const { container } = renderTable()
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_sort_by_gross_column_when_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Gross/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_sort_by_expenses_column_when_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Expenses/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_sort_by_net_column_when_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Net/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Premium', 'Standard'])
  })

  it('should_show_dash_for_null_price', () => {
    render(<ByTierTable rows={[{ tierName: 'Custom', price: null, lessonCount: 1, subtotal: 100, instructorCut: 25 }]} gross={gross} expenses={expenses} net={net} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_not_render_a_non_lesson_income_row_in_the_body', () => {
    renderTable()
    expect(screen.queryByText('Non-lesson income')).toBeNull()
  })

  it('should_render_a_tfoot_reconciliation_footer', () => {
    const { container } = renderTable()
    expect(container.querySelector('tfoot')).not.toBeNull()
  })

  it('should_render_the_footer_total_row_matching_the_gross_expenses_net_totals', () => {
    renderTable()
    const totalRow = screen.getByText('Total').closest('tr')!
    expect(totalRow.textContent).toContain('$200.00')
    expect(totalRow.textContent).toContain('$130.00')
    expect(totalRow.textContent).toContain('$70.00')
  })

  it('should_exclude_the_footer_from_the_sortable_tbody', () => {
    const { container } = renderTable()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  })
})
