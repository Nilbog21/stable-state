import { describe, it, expect } from 'vitest'
import { localToday, isSameLocalDay, isValidDateString, addDays, getWeekDates } from '../local-day'

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

describe('isValidDateString', () => {
  it('should_return_true_for_a_well_formed_date', () => {
    expect(isValidDateString('2026-07-23')).toBe(true)
  })

  it('should_return_false_for_wrong_format', () => {
    expect(isValidDateString('07/23/2026')).toBe(false)
  })

  it('should_return_false_for_an_out_of_range_month', () => {
    expect(isValidDateString('2026-13-01')).toBe(false)
  })

  it('should_return_false_for_an_out_of_range_day', () => {
    expect(isValidDateString('2026-02-30')).toBe(false)
  })

  it('should_return_false_for_an_empty_string', () => {
    expect(isValidDateString('')).toBe(false)
  })
})

describe('addDays', () => {
  it('should_add_positive_days_within_a_month', () => {
    expect(addDays('2026-07-23', 1)).toBe('2026-07-24')
  })

  it('should_subtract_days_via_a_negative_delta', () => {
    expect(addDays('2026-07-23', -1)).toBe('2026-07-22')
  })

  it('should_roll_over_a_month_boundary', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
  })

  it('should_roll_over_a_year_boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('getWeekDates', () => {
  it('should_return_seven_dates_starting_at_the_input_date', () => {
    expect(getWeekDates('2026-07-20')).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ])
  })

  it('should_roll_over_a_month_boundary', () => {
    expect(getWeekDates('2026-07-30')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ])
  })
})
