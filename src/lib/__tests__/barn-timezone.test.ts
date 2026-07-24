import { describe, it, expect } from 'vitest'
import { instantToLocalWallClock, wallClockToInstant, BARN_TIMEZONES } from '../barn-timezone'

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

describe('wallClockToInstant', () => {
  it('should_convert_eastern_wall_clock_to_utc_instant_during_daylight_saving', () => {
    const result = wallClockToInstant('2026-07-15T08:00:00', 'America/New_York')

    expect(result.toISOString()).toBe('2026-07-15T12:00:00.000Z')
  })

  it('should_convert_eastern_wall_clock_to_utc_instant_during_standard_time', () => {
    const result = wallClockToInstant('2026-01-15T07:00:00', 'America/New_York')

    expect(result.toISOString()).toBe('2026-01-15T12:00:00.000Z')
  })

  it('should_round_trip_with_instantToLocalWallClock', () => {
    const original = new Date('2026-03-01T15:30:00Z')
    const wallClock = instantToLocalWallClock(original, 'America/Chicago')

    const result = wallClockToInstant(wallClock, 'America/Chicago')

    expect(result.toISOString()).toBe(original.toISOString())
  })

  it('should_use_fixed_offset_for_a_timezone_without_daylight_saving', () => {
    const result = wallClockToInstant('2026-01-15T05:00:00', 'America/Phoenix')

    expect(result.toISOString()).toBe('2026-01-15T12:00:00.000Z')
  })
})

describe('BARN_TIMEZONES', () => {
  it('should_include_eastern_time_as_the_default_option', () => {
    expect(BARN_TIMEZONES.some((tz) => tz.value === 'America/New_York')).toBe(true)
  })
})
