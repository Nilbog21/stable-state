import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { UpcomingExpenseCard, formatExpenseDateTime } from '../UpcomingExpenseCard'
import { makeExpense } from '@/test/fixtures'

describe('formatExpenseDateTime', () => {
  it('should_prefix_with_today_when_expense_is_today', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    expect(formatExpenseDateTime({ expense_date: '2026-07-09', expense_time: '14:00:00' }, now)).toMatch(/^Today · /)
  })

  it('should_not_prefix_with_today_when_expense_is_not_today', () => {
    const now = new Date('2026-07-09T12:00:00Z')
    expect(formatExpenseDateTime({ expense_date: '2026-07-11', expense_time: '14:00:00' }, now)).not.toMatch(/^Today/)
  })
})

describe('UpcomingExpenseCard', () => {
  it('should_render_formatted_date_and_time', () => {
    render(<UpcomingExpenseCard expense={makeExpense({ expense_date: '2026-07-15', expense_time: '14:00:00' })} slug="green-acres" />)
    expect(screen.getByText(/ · /)).toBeDefined()
  })

  it('should_render_recipient', () => {
    render(<UpcomingExpenseCard expense={makeExpense({ recipient: 'Dr. Smith' })} slug="green-acres" />)
    expect(screen.getByText('Dr. Smith')).toBeDefined()
  })

  it('should_render_expense_type', () => {
    render(<UpcomingExpenseCard expense={makeExpense({ expense_type: 'Veterinary' })} slug="green-acres" />)
    expect(screen.getByText('Veterinary')).toBeDefined()
  })

  it('should_render_horse_names', () => {
    render(<UpcomingExpenseCard expense={makeExpense({ horse_names: ['Thunderbolt'] })} slug="green-acres" />)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_render_entire_barn_when_applies_to_all_horses', () => {
    render(<UpcomingExpenseCard expense={makeExpense({ applies_to_all_horses: true, horse_names: [] })} slug="green-acres" />)
    expect(screen.getByText('Entire Barn')).toBeDefined()
  })

  it('should_link_to_expense_detail_page', () => {
    render(<UpcomingExpenseCard expense={makeExpense({ id: 'expense-123' })} slug="green-acres" />)
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/expenses/expense-123')
  })
})
