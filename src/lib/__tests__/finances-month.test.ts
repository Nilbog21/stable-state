import { describe, it, expect, afterEach, vi } from 'vitest'
import { resolveFinancesMonth, formatMonthParam } from '../finances-month'

// A barn created well before every month these tests resolve, so the barn-creation clamp
// stays out of the way unless a test is specifically about it.
const OLD_BARN = '2020-01-15T12:00:00Z'

function atInstant(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('resolveFinancesMonth — current month is the barn\'s, not the host\'s', () => {
  it('should_resolve_the_barn_month_when_utc_has_already_rolled_over', () => {
    // 2026-08-01T02:00Z is still 2026-07-31 21:00 in New York.
    atInstant('2026-08-01T02:00:00Z')

    const result = resolveFinancesMonth(undefined, OLD_BARN, 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-07-01T00:00:00Z'))
  })

  it('should_end_the_barn_month_at_the_first_of_the_next_month', () => {
    atInstant('2026-08-01T02:00:00Z')

    const result = resolveFinancesMonth(undefined, OLD_BARN, 'America/New_York')

    expect(result.endDate).toEqual(new Date('2026-08-01T00:00:00Z'))
  })

  it('should_report_the_barn_month_as_the_current_month', () => {
    atInstant('2026-08-01T02:00:00Z')

    const result = resolveFinancesMonth(undefined, OLD_BARN, 'America/New_York')

    expect(result.isCurrentMonth).toBe(true)
  })

  it('should_offer_no_next_month_link_while_the_barn_is_still_in_the_old_month', () => {
    atInstant('2026-08-01T02:00:00Z')

    const result = resolveFinancesMonth(undefined, OLD_BARN, 'America/New_York')

    expect(result.nextMonthUrl).toBeNull()
  })

  it('should_use_each_barn_own_offset_rather_than_a_fixed_one', () => {
    // 09:00Z is 23:00 the previous day in Honolulu (UTC-10) — still July there.
    atInstant('2026-08-01T09:00:00Z')

    const result = resolveFinancesMonth(undefined, OLD_BARN, 'Pacific/Honolulu')

    expect(result.startDate).toEqual(new Date('2026-07-01T00:00:00Z'))
  })

  it('should_roll_over_once_the_barn_own_month_starts', () => {
    // 05:00Z is 01:00 in New York on 2026-08-01 (EDT, UTC-4).
    atInstant('2026-08-01T05:00:00Z')

    const result = resolveFinancesMonth(undefined, OLD_BARN, 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-08-01T00:00:00Z'))
  })

  it('should_clamp_a_future_month_param_to_the_barn_month', () => {
    atInstant('2026-08-01T02:00:00Z')

    const result = resolveFinancesMonth('2026-08', OLD_BARN, 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-07-01T00:00:00Z'))
  })

  it('should_clamp_to_the_barn_creation_month_in_the_barn_frame', () => {
    // Created 2026-07-01T02:00Z — which is 2026-06-30 in New York, so this is a June barn.
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-06', '2026-07-01T02:00:00Z', 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-06-01T00:00:00Z'))
  })

  it('should_offer_no_prev_month_link_at_the_barn_creation_month', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-06', '2026-07-01T02:00:00Z', 'America/New_York')

    expect(result.prevMonthUrl).toBeNull()
  })

  it('should_clamp_a_month_before_barn_creation_up_to_the_creation_month', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-01', '2026-07-01T02:00:00Z', 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-06-01T00:00:00Z'))
  })

  it('should_fall_back_to_no_lower_bound_when_barn_created_at_is_unparseable', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-01', 'not-a-date', 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-01-01T00:00:00Z'))
  })
})

describe('resolveFinancesMonth — month param parsing', () => {
  it('should_honour_a_valid_past_month_param', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-03', OLD_BARN, 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-03-01T00:00:00Z'))
  })

  it('should_ignore_a_month_param_with_the_wrong_number_of_parts', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-03-01', OLD_BARN, 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-08-01T00:00:00Z'))
  })

  it('should_ignore_a_non_numeric_month_param', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('abcd-ef', OLD_BARN, 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-08-01T00:00:00Z'))
  })

  it('should_ignore_an_out_of_range_month_number', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-13', OLD_BARN, 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-08-01T00:00:00Z'))
  })

  it('should_ignore_a_zero_month_number', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-00', OLD_BARN, 'America/New_York')

    expect(result.startDate).toEqual(new Date('2026-08-01T00:00:00Z'))
  })
})

describe('resolveFinancesMonth — label and pager URLs', () => {
  it('should_label_the_resolved_month', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-03', OLD_BARN, 'America/New_York')

    expect(result.monthLabel).toBe('March 2026')
  })

  it('should_wrap_the_prev_month_url_back_across_a_year_boundary', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-01', OLD_BARN, 'America/New_York')

    expect(result.prevMonthUrl).toBe('?month=2025-12')
  })

  it('should_wrap_the_next_month_url_forward_across_a_year_boundary', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2025-12', OLD_BARN, 'America/New_York')

    expect(result.nextMonthUrl).toBe('?month=2026-01')
  })

  it('should_offer_both_pager_urls_for_a_mid_range_month', () => {
    atInstant('2026-08-15T12:00:00Z')

    const result = resolveFinancesMonth('2026-03', OLD_BARN, 'America/New_York')

    expect([result.prevMonthUrl, result.nextMonthUrl]).toEqual(['?month=2026-02', '?month=2026-04'])
  })
})

describe('formatMonthParam', () => {
  it('should_round_trip_a_resolved_start_date_back_into_a_month_param', () => {
    atInstant('2026-08-15T12:00:00Z')

    const { startDate } = resolveFinancesMonth('2026-03', OLD_BARN, 'America/New_York')

    expect(formatMonthParam(startDate)).toBe('2026-03')
  })
})
