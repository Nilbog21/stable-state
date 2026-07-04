import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ExpenseRow, formatExpenseAmount, formatExpenseTime, formatExpenseHorses } from '../ExpenseRow'
import { createMockExpenseWithHorses } from '@/test/fixtures'

afterEach(cleanup)

function renderRow(overrides = {}) {
  render(
    <table>
      <tbody>
        <ExpenseRow expense={createMockExpenseWithHorses(overrides)} slug="green-acres" />
      </tbody>
    </table>
  )
}

describe('ExpenseRow', () => {
  it('should_render_formatted_expense_date', () => {
    renderRow({ expense_date: '2026-07-01' })
    expect(screen.getByText('Jul 1, 2026')).toBeDefined()
  })

  it('should_render_formatted_expense_time_when_set', () => {
    renderRow({ expense_time: '14:30:00' })
    expect(screen.getByText('2:30 PM')).toBeDefined()
  })

  it('should_render_dash_when_expense_time_not_set', () => {
    renderRow({ expense_time: null })
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_render_recipient', () => {
    renderRow({ recipient: 'Dr. Smith' })
    expect(screen.getByText('Dr. Smith')).toBeDefined()
  })

  it('should_render_expense_type', () => {
    renderRow({ expense_type: 'Veterinary' })
    expect(screen.getByText('Veterinary')).toBeDefined()
  })

  it('should_render_entire_barn_when_applies_to_all_horses', () => {
    renderRow({ applies_to_all_horses: true, horse_names: [] })
    expect(screen.getByText('Entire Barn')).toBeDefined()
  })

  it('should_render_horse_names_when_specific_horses', () => {
    renderRow({ applies_to_all_horses: false, horse_names: ['Thunderbolt', 'Shadow'] })
    expect(screen.getByText('Thunderbolt, Shadow')).toBeDefined()
  })

  it('should_render_dash_when_no_horses_and_not_applies_to_all', () => {
    renderRow({ applies_to_all_horses: false, horse_names: [], expense_time: '09:00:00' })
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_render_formatted_amount_when_set', () => {
    renderRow({ amount: 42.5 })
    expect(screen.getByText('$42.50')).toBeDefined()
  })

  it('should_render_dash_when_amount_not_set', () => {
    renderRow({ amount: null, expense_time: '09:00:00' })
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_render_delete_link_with_correct_href', () => {
    renderRow({ id: 'expense-1' })
    const link = screen.getByRole('link', { name: /delete/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/expenses\/expense-1\/delete$/)
  })
})

describe('formatExpenseAmount', () => {
  it('should_return_dash_for_null_amount', () => {
    expect(formatExpenseAmount(null)).toBe('—')
  })

  it('should_return_dollar_formatted_amount', () => {
    expect(formatExpenseAmount(42.5)).toBe('$42.50')
  })
})

describe('formatExpenseTime', () => {
  it('should_return_dash_for_null_time', () => {
    expect(formatExpenseTime(null)).toBe('—')
  })

  it('should_return_12hr_formatted_time', () => {
    expect(formatExpenseTime('14:30:00')).toBe('2:30 PM')
  })
})

describe('formatExpenseHorses', () => {
  it('should_return_entire_barn_when_applies_to_all_horses', () => {
    expect(formatExpenseHorses({ applies_to_all_horses: true, horse_names: [] })).toBe('Entire Barn')
  })

  it('should_return_joined_horse_names', () => {
    expect(formatExpenseHorses({ applies_to_all_horses: false, horse_names: ['A', 'B'] })).toBe('A, B')
  })

  it('should_return_dash_when_no_horses', () => {
    expect(formatExpenseHorses({ applies_to_all_horses: false, horse_names: [] })).toBe('—')
  })
})
