import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ExpenseCard } from '../ExpenseCard'
import { createMockExpenseWithHorses } from '@/test/fixtures'
import { calendarDate } from '@/lib/local-day'

afterEach(cleanup)

/**
 * Barn-local wall clock, the frame ExpenseCard now compares in. The default sits *before* the
 * mock expense's own 2026-07-01 date, so the cases below that say nothing about the badge render
 * without one and stay about the field they name.
 */
const BEFORE_DUE = '2026-06-01T00:00:00'
const AFTER_DUE = '2026-07-02T00:00:00'

function renderCard(overrides = {}, nowWall = BEFORE_DUE) {
  render(<ExpenseCard expense={createMockExpenseWithHorses(overrides)} slug="green-acres" nowWall={nowWall} />)
}

describe('ExpenseCard', () => {
  it('should_render_formatted_expense_date', () => {
    renderCard({ expense_date: calendarDate('2026-07-01') })
    expect(screen.getByText(/Jul 1, 2026/)).toBeDefined()
  })

  it('should_render_formatted_expense_time_when_set', () => {
    renderCard({ expense_time: '14:30:00' })
    expect(screen.getByText(/2:30 PM/)).toBeDefined()
  })

  it('should_omit_time_segment_when_expense_time_not_set', () => {
    renderCard({ expense_time: null })
    expect(screen.getByText((_, el) => el?.textContent === 'Jul 1, 2026')).toBeDefined()
  })

  it('should_render_recipient', () => {
    renderCard({ recipient: 'Dr. Smith' })
    expect(screen.getByText(/Dr\. Smith/)).toBeDefined()
  })

  it('should_render_expense_type', () => {
    renderCard({ expense_type: 'Veterinary' })
    expect(screen.getByText(/Veterinary/)).toBeDefined()
  })

  it('should_render_recipient_and_expense_type_combined_on_one_line', () => {
    renderCard({ recipient: 'Dr. Smith', expense_type: 'Veterinary' })
    expect(screen.getByText('Dr. Smith · Veterinary')).toBeDefined()
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

  it('should_render_no_amount_specified_when_amount_not_set', () => {
    renderCard({ amount: null, expense_time: '09:00:00' })
    expect(screen.getByText('(no amount specified)')).toBeDefined()
  })

  it('should_not_style_no_amount_specified_as_amber_before_due', () => {
    renderCard({ amount: null, expense_date: calendarDate('2026-07-01'), expense_time: null }, BEFORE_DUE)
    expect(screen.getByText('(no amount specified)').className).not.toContain('amber')
  })

  it('should_style_no_amount_specified_as_amber_and_show_past_due_badge_once_due_has_passed', () => {
    renderCard({ amount: null, expense_date: calendarDate('2026-07-01'), expense_time: null }, AFTER_DUE)
    expect(screen.getByText('(no amount specified)').className).toContain('amber')
    expect(screen.getByText('Past Due')).toBeDefined()
  })

  it('should_show_past_due_badge_when_amount_is_set_but_payment_type_is_not', () => {
    renderCard(
      { amount: 42.5, payment_type: null, expense_date: calendarDate('2026-07-01'), expense_time: null },
      AFTER_DUE
    )
    expect(screen.getByText('Past Due')).toBeDefined()
  })

  // Amber text stays reserved for "(no amount specified)": on an amounted past-due card only the
  // badge is amber, so the figure itself doesn't read as the missing thing.
  it('should_not_style_the_amount_as_amber_on_a_past_due_card', () => {
    renderCard(
      { amount: 42.5, payment_type: null, expense_date: calendarDate('2026-07-01'), expense_time: null },
      AFTER_DUE
    )
    expect(screen.getByText('$42.50').className).not.toContain('amber')
  })

  it('should_not_show_past_due_badge_when_amount_and_payment_type_are_both_set', () => {
    renderCard(
      { amount: 42.5, payment_type: 'cash', expense_date: calendarDate('2026-07-01'), expense_time: null },
      AFTER_DUE
    )
    expect(screen.queryByText('Past Due')).toBeNull()
  })

  it('should_link_whole_card_to_expense_edit_page', () => {
    renderCard({ id: 'expense-1' })
    const link = screen.getByRole('link')
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/expenses\/expense-1$/)
  })
})
