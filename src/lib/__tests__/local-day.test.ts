import { describe, it, expect } from 'vitest'
import { localToday, isSameLocalDay } from '../local-day'

describe('localToday', () => {
  it('should_format_local_date_as_yyyy_mm_dd', () => {
    expect(localToday(new Date('2026-07-09T12:00:00'))).toBe('2026-07-09')
  })

  it('should_zero_pad_single_digit_month_and_day', () => {
    expect(localToday(new Date('2026-01-05T12:00:00'))).toBe('2026-01-05')
  })

  it('should_default_to_current_date_when_called_with_no_argument', () => {
    expect(localToday()).toBe(localToday(new Date()))
  })
})

describe('isSameLocalDay', () => {
  it('should_return_true_for_same_local_day_different_times', () => {
    const a = new Date('2026-07-09T01:00:00')
    const b = new Date('2026-07-09T23:00:00')
    expect(isSameLocalDay(a, b)).toBe(true)
  })

  it('should_return_false_across_a_day_boundary', () => {
    const a = new Date('2026-07-09T23:00:00')
    const b = new Date('2026-07-10T01:00:00')
    expect(isSameLocalDay(a, b)).toBe(false)
  })

  it('should_return_false_across_a_month_boundary', () => {
    const a = new Date('2026-06-30T12:00:00')
    const b = new Date('2026-07-01T12:00:00')
    expect(isSameLocalDay(a, b)).toBe(false)
  })

  it('should_return_false_across_a_year_boundary', () => {
    const a = new Date('2025-12-31T12:00:00')
    const b = new Date('2026-01-01T12:00:00')
    expect(isSameLocalDay(a, b)).toBe(false)
  })
})
