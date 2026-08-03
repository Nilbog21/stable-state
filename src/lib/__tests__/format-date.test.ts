import { describe, it, expect } from 'vitest'
import { formatBarnDateTime, formatBarnDate, formatBarnTime } from '../format-date'
import type { Instant } from '../db/types'

// The suite runs under TZ=Asia/Kolkata (vitest.config.mts), so a New York barn's instant
// renders a different wall clock — and, for the 20:00Z case below, a different calendar
// day — than the host would produce. That difference is what these assert.
const NY_AFTERNOON: Instant = { at: '2026-07-15T20:00:00Z', tz: 'America/New_York' }

describe('formatBarnDateTime', () => {
  it('should_render_the_instant_in_the_barns_own_timezone', () => {
    expect(formatBarnDateTime(NY_AFTERNOON)).toBe('Jul 15, 2026, 4:00 PM')
  })
})

describe('formatBarnDate', () => {
  it('should_render_the_barn_local_calendar_day_not_the_hosts', () => {
    expect(formatBarnDate(NY_AFTERNOON)).toBe('Jul 15, 2026')
  })
})

describe('formatBarnTime', () => {
  it('should_render_the_barn_local_wall_clock_time', () => {
    expect(formatBarnTime(NY_AFTERNOON)).toBe('4:00 PM')
  })
})

describe('the Instant brand', () => {
  it('should_reject_a_bare_timestamptz_string_where_an_instant_is_required', () => {
    // @ts-expect-error — a bare TIMESTAMPTZ string carries no zone, which is the whole
    // point of the brand: it cannot reach a barn formatter without one.
    const rejected: Instant = '2026-07-15T20:00:00Z'

    expect(rejected).toBe('2026-07-15T20:00:00Z')
  })
})
