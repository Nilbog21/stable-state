import { describe, it, expect } from 'vitest'
import { formatExpenseAmount, formatExpenseTime, formatExpenseHorses } from '../format-expense'

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
