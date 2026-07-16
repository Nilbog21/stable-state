import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ExpenseCard } from '../ExpenseCard'
import { createMockExpenseWithHorses } from '@/test/fixtures'

afterEach(cleanup)

function renderCard(overrides = {}) {
  render(<ExpenseCard expense={createMockExpenseWithHorses(overrides)} slug="green-acres" />)
}

describe('ExpenseCard', () => {
  it('should_render_formatted_expense_date', () => {
    renderCard({ expense_date: '2026-07-01' })
    expect(screen.getByText(/Jul 1, 2026/)).toBeDefined()
  })

  it('should_render_formatted_expense_time_when_set', () => {
    renderCard({ expense_time: '14:30:00' })
    expect(screen.getByText(/2:30 PM/)).toBeDefined()
  })

  it('should_render_dash_when_expense_time_not_set', () => {
    renderCard({ expense_time: null })
    expect(screen.getByText((_, el) => el?.textContent === 'Jul 1, 2026 · —')).toBeDefined()
  })

  it('should_render_recipient', () => {
    renderCard({ recipient: 'Dr. Smith' })
    expect(screen.getByText('Dr. Smith')).toBeDefined()
  })

  it('should_render_expense_type', () => {
    renderCard({ expense_type: 'Veterinary' })
    expect(screen.getByText('Veterinary')).toBeDefined()
  })

  it('should_render_entire_barn_when_applies_to_all_horses', () => {
    renderCard({ applies_to_all_horses: true, horse_names: [] })
    expect(screen.getByText('Entire Barn')).toBeDefined()
  })

  it('should_render_horse_names_when_specific_horses', () => {
    renderCard({ applies_to_all_horses: false, horse_names: ['Thunderbolt', 'Shadow'] })
    expect(screen.getByText('Thunderbolt, Shadow')).toBeDefined()
  })

  it('should_render_dash_when_no_horses_and_not_applies_to_all', () => {
    renderCard({ applies_to_all_horses: false, horse_names: [], expense_time: '09:00:00' })
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_render_formatted_amount_when_set', () => {
    renderCard({ amount: 42.5 })
    expect(screen.getByText('$42.50')).toBeDefined()
  })

  it('should_render_dash_when_amount_not_set', () => {
    renderCard({ amount: null, expense_time: '09:00:00' })
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_link_whole_card_to_expense_edit_page', () => {
    renderCard({ id: 'expense-1' })
    const link = screen.getByRole('link')
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/expenses\/expense-1$/)
  })
})
