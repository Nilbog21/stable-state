import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ByPaidToTable } from '../ByPaidToTable'

afterEach(cleanup)

const rows = [
  { recipient: 'Zoe Vet', totalExpenses: 100 },
  { recipient: 'Alice Farrier', totalExpenses: 50 },
]

function rowNames(container: HTMLElement) {
  return Array.from(container.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent)
}

describe('ByPaidToTable', () => {
  it('should_render_recipient_and_expense_amount_headers', () => {
    render(<ByPaidToTable rows={rows} slug="green-acres" monthParam="2026-06" />)
    expect(screen.getByRole('columnheader', { name: /Recipient/ })).toBeDefined()
    expect(screen.getByRole('columnheader', { name: 'Expense Amount' })).toBeDefined()
  })

  it('should_default_sort_by_recipient_name_ascending', () => {
    const { container } = render(<ByPaidToTable rows={rows} slug="green-acres" monthParam="2026-06" />)
    expect(rowNames(container)).toEqual(['Alice Farrier', 'Zoe Vet'])
  })

  it('should_flip_to_descending_when_recipient_header_clicked', () => {
    const { container } = render(<ByPaidToTable rows={rows} slug="green-acres" monthParam="2026-06" />)
    fireEvent.click(screen.getByRole('columnheader', { name: /Recipient/ }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Zoe Vet', 'Alice Farrier'])
  })

  it('should_sort_ascending_by_expense_amount_on_first_click', () => {
    const { container } = render(<ByPaidToTable rows={rows} slug="green-acres" monthParam="2026-06" />)
    fireEvent.click(screen.getByRole('columnheader', { name: 'Expense Amount' }).querySelector('button')!)
    expect(rowNames(container)).toEqual(['Alice Farrier', 'Zoe Vet'])
  })

  it('should_link_recipient_name_to_drilldown_with_month_param', () => {
    render(<ByPaidToTable rows={rows} slug="green-acres" monthParam="2026-06" />)
    expect(screen.getByRole('link', { name: 'Alice Farrier' }).getAttribute('href')).toBe('/barn/green-acres/finances/expenses/Alice%20Farrier?month=2026-06')
  })
})
