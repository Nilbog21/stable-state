import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ByInstructorTable } from '../ByInstructorTable'
import type { ReconciliationColumn } from '@/lib/finances-reconciliation'

afterEach(cleanup)

const rows = [
  { trainerId: 't-2', trainerName: 'Zane', totalIncome: 100, grossIncome: 120 },
  { trainerId: 't-1', trainerName: 'Amy', totalIncome: 50, grossIncome: 60 },
]

const gross: ReconciliationColumn = { subtotal: 180, outside: 0, unattributed: 0, total: 180 }
const expenses: ReconciliationColumn = { subtotal: 30, outside: 100, unattributed: 5, total: 135 }
const net: ReconciliationColumn = { subtotal: 150, outside: -100, unattributed: -5, total: 45 }

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

function renderTable(props: Partial<React.ComponentProps<typeof ByInstructorTable>> = {}) {
  return render(<ByInstructorTable rows={rows} slug="green-acres" monthParam="2026-06" gross={gross} expenses={expenses} net={net} {...props} />)
}

describe('ByInstructorTable', () => {
  it('should_render_uniform_gross_expenses_net_headers', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼ⓘ]/g, '').trim())
    expect(headers).toEqual(['Trainer', 'Gross', 'Expenses', 'Net'])
  })

  it('should_default_sort_by_trainer_name_ascending', () => {
    const { container } = renderTable()
    expect(rowNames(container)).toEqual(['Amy', 'Zane'])
  })

  it('should_flip_to_descending_when_trainer_header_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /Trainer/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Zane', 'Amy'])
  })

  it('should_sort_ascending_by_gross_on_first_click', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Gross/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amy', 'Zane'])
  })

  it('should_sort_by_expenses_column_when_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Expenses/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amy', 'Zane'])
  })

  it('should_sort_by_net_column_when_clicked', () => {
    const { container } = renderTable()
    fireEvent.click(screen.getByRole('columnheader', { name: /^Net/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Amy', 'Zane'])
  })

  it('should_link_trainer_name_to_drilldown_with_month_param', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'Amy' }).getAttribute('href')).toBe('/barn/green-acres/finances/trainers/t-1?month=2026-06')
  })

  it('should_not_render_a_non_lesson_income_row_in_the_body', () => {
    renderTable()
    expect(screen.queryByText('Non-lesson income')).toBeNull()
  })

  it('should_not_render_a_no_instructor_row_in_the_body', () => {
    renderTable()
    expect(screen.queryByText('No instructor')).toBeNull()
  })

  it('should_render_a_tfoot_reconciliation_footer', () => {
    const { container } = renderTable()
    expect(container.querySelector('tfoot')).not.toBeNull()
  })

  it('should_render_the_footer_total_row_matching_the_gross_expenses_net_totals', () => {
    renderTable()
    const totalRow = screen.getByText('Total').closest('tr')!
    const cells = Array.from(totalRow.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Total', '$180.00', '$135.00', '$45.00'])
  })

  it('should_exclude_the_footer_from_the_sortable_tbody', () => {
    const { container } = renderTable()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  it('should_render_a_dash_for_gross_and_expenses_when_grossincome_is_null', () => {
    renderTable({ rows: [{ trainerId: 't-3', trainerName: 'Nil', totalIncome: 40, grossIncome: null }] })
    const row = screen.getByText('Nil').closest('tr')!
    const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent)
    expect(cells).toEqual(['Nil', '—', '—', '$40.00'])
  })

  it('should_sort_a_null_grossincome_row_before_real_gross_rows_when_gross_header_clicked', () => {
    const { container } = renderTable({ rows: [...rows, { trainerId: 't-3', trainerName: 'Nil', totalIncome: 40, grossIncome: null }] })
    fireEvent.click(screen.getByRole('columnheader', { name: /^Gross/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Nil', 'Amy', 'Zane'])
  })

  it('should_sort_a_null_grossincome_row_before_real_rows_when_expenses_header_clicked', () => {
    const { container } = renderTable({ rows: [...rows, { trainerId: 't-3', trainerName: 'Nil', totalIncome: 40, grossIncome: null }] })
    fireEvent.click(screen.getByRole('columnheader', { name: /^Expenses/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Nil', 'Amy', 'Zane'])
  })
})
