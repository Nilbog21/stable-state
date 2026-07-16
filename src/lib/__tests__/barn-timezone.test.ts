import { describe, it, expect } from 'vitest'
import { instantToLocalWallClock, BARN_TIMEZONES } from '../barn-timezone'

describe('instantToLocalWallClock', () => {
  it('should_convert_utc_instant_to_eastern_wall_clock_during_daylight_saving', () => {
    const result = instantToLocalWallClock(new Date('2026-07-15T12:00:00Z'), 'America/New_York')

    expect(result).toBe('2026-07-15T08:00:00')
  })

  it('should_convert_utc_instant_to_eastern_wall_clock_during_standard_time', () => {
    const result = instantToLocalWallClock(new Date('2026-01-15T12:00:00Z'), 'America/New_York')

    expect(result).toBe('2026-01-15T07:00:00')
  })

  it('should_use_fixed_offset_for_a_timezone_without_daylight_saving', () => {
    const summer = instantToLocalWallClock(new Date('2026-07-15T12:00:00Z'), 'America/Phoenix')
    const winter = instantToLocalWallClock(new Date('2026-01-15T12:00:00Z'), 'America/Phoenix')

    expect(summer).toBe('2026-07-15T05:00:00')
    expect(winter).toBe('2026-01-15T05:00:00')
  })
})

describe('BARN_TIMEZONES', () => {
  it('should_include_eastern_time_as_the_default_option', () => {
    expect(BARN_TIMEZONES.some((tz) => tz.value === 'America/New_York')).toBe(true)
  })
})
