import { describe, it, expect } from 'vitest'
import { localToday, isValidDateString, addDays, getWeekDates } from '../local-day'

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
  it('should_return_the_sunday_start_calendar_week_containing_a_mid_week_date', () => {
    // 2026-07-23 is a Thursday
    expect(getWeekDates('2026-07-23')).toEqual([
      '2026-07-19',
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
    ])
  })

  it('should_return_itself_as_the_start_when_input_is_a_sunday', () => {
    expect(getWeekDates('2026-07-19')[0]).toBe('2026-07-19')
  })

  it('should_return_itself_as_the_end_when_input_is_a_saturday', () => {
    expect(getWeekDates('2026-07-25')[6]).toBe('2026-07-25')
  })

  it('should_roll_over_a_month_and_year_boundary', () => {
    // 2026-12-31 is a Thursday
    expect(getWeekDates('2026-12-31')).toEqual([
      '2026-12-27',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })
})
