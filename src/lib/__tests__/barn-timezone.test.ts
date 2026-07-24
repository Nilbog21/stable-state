import { describe, it, expect } from 'vitest'
import { instantToLocalWallClock, wallClockToInstant, BARN_TIMEZONES } from '../barn-timezone'
import { getWeekDates } from '../local-day'

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

// A Week view's 7-day range spans a DST transition far more often than a Day view's
// single-day range ever would -- these confirm getWeekDates + wallClockToInstant's
// existing midnight-only usage (never inside the skipped/repeated 2am hour) still holds.
describe('week-range day boundaries across a DST transition (#1016)', () => {
  it('should_convert_midnight_wall_clock_correctly_on_the_spring_forward_day', () => {
    expect(wallClockToInstant('2026-03-08T00:00:00', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z')
  })

  it('should_convert_midnight_wall_clock_correctly_the_day_after_spring_forward', () => {
    expect(wallClockToInstant('2026-03-09T00:00:00', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z')
  })

  it('should_convert_midnight_wall_clock_correctly_on_the_fall_back_day', () => {
    expect(wallClockToInstant('2026-11-01T00:00:00', 'America/New_York').toISOString()).toBe('2026-11-01T04:00:00.000Z')
  })

  it('should_convert_midnight_wall_clock_correctly_the_day_after_fall_back', () => {
    expect(wallClockToInstant('2026-11-02T00:00:00', 'America/New_York').toISOString()).toBe('2026-11-02T05:00:00.000Z')
  })

  it('should_produce_seven_strictly_increasing_day_boundary_instants_spanning_the_spring_forward_transition', () => {
    const weekDates = getWeekDates('2026-03-05') // Thu Mar 5 -> Wed Mar 11, includes the Mar 8 transition
    const instants = weekDates.map((d) => wallClockToInstant(`${d}T00:00:00`, 'America/New_York').getTime())

    for (let i = 1; i < instants.length; i++) {
      expect(instants[i]).toBeGreaterThan(instants[i - 1])
    }
    // Mar 7 (idx 2->3) is a normal 24h day; Mar 8 (idx 3->4) is the short 23h transition day.
    expect(instants[3] - instants[2]).toBe(24 * 60 * 60 * 1000)
    expect(instants[4] - instants[3]).toBe(23 * 60 * 60 * 1000)
  })

  it('should_produce_seven_strictly_increasing_day_boundary_instants_spanning_the_fall_back_transition', () => {
    const weekDates = getWeekDates('2026-10-29') // Thu Oct 29 -> Wed Nov 4, includes the Nov 1 transition
    const instants = weekDates.map((d) => wallClockToInstant(`${d}T00:00:00`, 'America/New_York').getTime())

    for (let i = 1; i < instants.length; i++) {
      expect(instants[i]).toBeGreaterThan(instants[i - 1])
    }
    // Nov 1 (idx 3->4) is the long 25h transition day.
    expect(instants[4] - instants[3]).toBe(25 * 60 * 60 * 1000)
  })
})
