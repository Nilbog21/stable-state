import { describe, it, expect } from 'vitest'
import { formatExpenseAmount, formatExpenseTime, formatExpenseHorses, isExpensePastDue } from '../format-expense'
import { calendarDate } from '../local-day'

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

describe('isExpensePastDue', () => {
  it('should_return_false_when_amount_is_set', () => {
    const expense = { amount: 100, expense_date: calendarDate('2026-07-01'), expense_time: null }
    expect(isExpensePastDue(expense, Date.parse('2026-07-02T00:00:00Z'))).toBe(false)
  })

  it('should_return_false_before_due_datetime', () => {
    const expense = { amount: null, expense_date: calendarDate('2026-07-01'), expense_time: null }
    expect(isExpensePastDue(expense, Date.parse('2026-06-01T00:00:00Z'))).toBe(false)
  })

  it('should_return_true_after_due_datetime_with_no_time_set', () => {
    const expense = { amount: null, expense_date: calendarDate('2026-07-01'), expense_time: null }
    expect(isExpensePastDue(expense, Date.parse('2026-07-02T00:00:00Z'))).toBe(true)
  })

  it('should_return_true_after_due_datetime_with_time_set', () => {
    const expense = { amount: null, expense_date: calendarDate('2026-07-01'), expense_time: '09:00:00' }
    expect(isExpensePastDue(expense, Date.parse('2026-07-01T10:00:00Z'))).toBe(true)
  })
})
