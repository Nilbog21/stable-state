import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { CalendarExpenseCard } from '../CalendarExpenseCard'
import { formatExpenseTime } from '@/lib/format-expense'
import { makeExpense } from '@/test/fixtures'

describe('CalendarExpenseCard', () => {
  it('should_render_formatted_time', () => {
    render(<CalendarExpenseCard expense={makeExpense({ expense_date: '2026-07-15', expense_time: '14:00:00' })} slug="green-acres" />)
    expect(screen.getByText(formatExpenseTime('14:00:00'))).toBeDefined()
  })

  it('should_render_recipient', () => {
    render(<CalendarExpenseCard expense={makeExpense({ recipient: 'Dr. Smith' })} slug="green-acres" />)
    expect(screen.getByText('Dr. Smith')).toBeDefined()
  })

  it('should_render_expense_type', () => {
    render(<CalendarExpenseCard expense={makeExpense({ expense_type: 'Veterinary' })} slug="green-acres" />)
    expect(screen.getByText('Veterinary')).toBeDefined()
  })

  it('should_render_horse_names', () => {
    render(<CalendarExpenseCard expense={makeExpense({ horse_names: ['Thunderbolt'] })} slug="green-acres" />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_render_entire_barn_when_applies_to_all_horses', () => {
    render(<CalendarExpenseCard expense={makeExpense({ applies_to_all_horses: true, horse_names: [] })} slug="green-acres" />)
    expect(screen.getByText('Entire Barn')).toBeDefined()
  })

  it('should_link_to_expense_detail_page', () => {
    render(<CalendarExpenseCard expense={makeExpense({ id: 'expense-123' })} slug="green-acres" />)
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/expenses/expense-123')
  })
})
