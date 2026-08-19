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

/**
 * Both halves of the predicate's agreement with `getOutstandingExpenses` (`db/expenses.ts`),
 * which is the whole point of the function: the *set* (outstanding is a missing amount, a missing
 * payment type, or both) and the *frame* (the due moment is compared in the barn's wall clock,
 * never the host's or UTC's).
 */
describe('isExpensePastDue', () => {
  const JULY_FIRST = calendarDate('2026-07-01')

  it('should_return_false_when_amount_and_payment_type_are_both_set', () => {
    const expense = { amount: 100, payment_type: 'cash' as const, expense_date: JULY_FIRST, expense_time: null }
    expect(isExpensePastDue(expense, '2026-07-02T00:00:00')).toBe(false)
  })

  it('should_return_true_when_amount_is_set_but_payment_type_is_not', () => {
    const expense = { amount: 100, payment_type: null, expense_date: JULY_FIRST, expense_time: null }
    expect(isExpensePastDue(expense, '2026-07-02T00:00:00')).toBe(true)
  })

  it('should_return_true_when_payment_type_is_set_but_amount_is_not', () => {
    const expense = { amount: null, payment_type: 'cash' as const, expense_date: JULY_FIRST, expense_time: null }
    expect(isExpensePastDue(expense, '2026-07-02T00:00:00')).toBe(true)
  })

  it('should_return_false_before_due_datetime', () => {
    const expense = { amount: null, payment_type: null, expense_date: JULY_FIRST, expense_time: null }
    expect(isExpensePastDue(expense, '2026-06-01T00:00:00')).toBe(false)
  })

  it('should_return_true_after_due_datetime_with_no_time_set', () => {
    const expense = { amount: null, payment_type: null, expense_date: JULY_FIRST, expense_time: null }
    expect(isExpensePastDue(expense, '2026-07-02T00:00:00')).toBe(true)
  })

  it('should_return_true_after_due_datetime_with_time_set', () => {
    const expense = { amount: null, payment_type: null, expense_date: JULY_FIRST, expense_time: '09:00:00' }
    expect(isExpensePastDue(expense, '2026-07-01T10:00:00')).toBe(true)
  })

  // The frame case, and the reason `nowWall` is a string rather than an instant. 8 PM on the
  // expense's own day in a barn west of UTC is 2026-07-02T00:00Z — which the old UTC-tagged
  // comparison read as past due, four hours before the barn's own midnight.
  it('should_return_false_at_8pm_barn_time_on_a_date_only_expenses_own_day', () => {
    const expense = { amount: null, payment_type: null, expense_date: JULY_FIRST, expense_time: null }
    expect(isExpensePastDue(expense, '2026-07-01T20:00:00')).toBe(false)
  })

  it('should_return_true_once_the_barns_own_midnight_has_passed', () => {
    const expense = { amount: null, payment_type: null, expense_date: JULY_FIRST, expense_time: null }
    expect(isExpensePastDue(expense, '2026-07-02T00:00:00')).toBe(true)
  })
})
