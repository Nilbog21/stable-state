import { describe, it, expect } from 'vitest'
import { instantToLocalWallClock, wallClockToInstant, barnToday, BARN_TIMEZONES } from '../barn-timezone'
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

// A single guess-and-correct pass measures the zone's offset at the *naive* guess, which
// sits 4-5 hours from the true instant -- so on a transition day the sample lands on the
// wrong side of the boundary and the result is an hour off for a whole band of morning
// hours, not just the skipped/repeated one. Harmless while every caller passed midnight,
// but #1222 routes DateHourPicker, EventForm and LessonForm's isPastLessonAt through this
// with arbitrary user-picked hours.
describe('wallClockToInstant across a DST transition (#1222)', () => {
  // 04:00 is past the 2am jump, so it is already EDT (UTC-4). Sampling the offset at the
  // naive guess measured EST instead and produced 09:00Z, an hour late.
  it('should_resolve_a_morning_wall_clock_on_the_spring_forward_day', () => {
    const result = wallClockToInstant('2026-03-08T04:00:00', 'America/New_York')

    expect(result.toISOString()).toBe('2026-03-08T08:00:00.000Z')
  })

  it('should_resolve_a_morning_wall_clock_on_the_fall_back_day', () => {
    const result = wallClockToInstant('2026-11-01T03:00:00', 'America/New_York')

    expect(result.toISOString()).toBe('2026-11-01T08:00:00.000Z')
  })

  // Derived from real instants rather than from the digits 00..23, so the wall clock that
  // spring-forward skips is never in the set -- every entry here is a time that exists.
  const roundTripFailures = (utcDay: string, timeZone: string) =>
    Array.from({ length: 24 }, (_, i) => new Date(`${utcDay}T00:00:00Z`).getTime() + i * 3600_000)
      .map((ms) => instantToLocalWallClock(new Date(ms), timeZone))
      .filter((wallClock) => instantToLocalWallClock(wallClockToInstant(wallClock, timeZone), timeZone) !== wallClock)

  it('should_round_trip_every_real_wall_clock_on_the_spring_forward_day', () => {
    expect(roundTripFailures('2026-03-08', 'America/New_York')).toEqual([])
  })

  it('should_round_trip_every_real_wall_clock_on_the_fall_back_day', () => {
    expect(roundTripFailures('2026-11-01', 'America/New_York')).toEqual([])
  })

  // 2am doesn't exist on the spring-forward day -- the clock jumps 01:59:59 -> 03:00:00.
  // There is no right answer, so this pins the one we give: the entered wall clock minus the
  // jump, i.e. 06:00Z, which renders back as 01:00 -- an hour earlier than entered, not the
  // 01:59:59 boundary.
  it('should_resolve_the_wall_clock_skipped_by_spring_forward_to_an_hour_before_it', () => {
    const result = wallClockToInstant('2026-03-08T02:00:00', 'America/New_York')

    expect(result.toISOString()).toBe('2026-03-08T06:00:00.000Z')
  })
})

describe('barnToday', () => {
  // The same instant is already Mar 2 in Eastern but still Mar 1 in Pacific -- the whole
  // reason a comparison against barn data can't read the viewer's own clock.
  it('should_return_the_barn_local_calendar_day_of_an_instant', () => {
    expect(barnToday('America/New_York', new Date('2026-03-02T06:00:00Z'))).toBe('2026-03-02')
  })

  it('should_return_the_previous_day_for_a_barn_west_of_that_instants_midnight', () => {
    expect(barnToday('America/Los_Angeles', new Date('2026-03-02T06:00:00Z'))).toBe('2026-03-01')
  })

  it('should_default_to_now', () => {
    expect(barnToday('America/New_York')).toBe(barnToday('America/New_York', new Date()))
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
    const weekDates = getWeekDates('2026-03-08') // Sun Mar 8 -> Sat Mar 14, week starts on the transition day itself
    const instants = weekDates.map((d) => wallClockToInstant(`${d}T00:00:00`, 'America/New_York').getTime())

    for (let i = 1; i < instants.length; i++) {
      expect(instants[i]).toBeGreaterThan(instants[i - 1])
    }
    // Mar 8 (idx 0->1) is the short 23h transition day; Mar 9 (idx 1->2) is a normal 24h day.
    expect(instants[1] - instants[0]).toBe(23 * 60 * 60 * 1000)
    expect(instants[2] - instants[1]).toBe(24 * 60 * 60 * 1000)
  })

  it('should_produce_seven_strictly_increasing_day_boundary_instants_spanning_the_fall_back_transition', () => {
    const weekDates = getWeekDates('2026-11-01') // Sun Nov 1 -> Sat Nov 7, week starts on the transition day itself
    const instants = weekDates.map((d) => wallClockToInstant(`${d}T00:00:00`, 'America/New_York').getTime())

    for (let i = 1; i < instants.length; i++) {
      expect(instants[i]).toBeGreaterThan(instants[i - 1])
    }
    // Nov 1 (idx 0->1) is the long 25h transition day.
    expect(instants[1] - instants[0]).toBe(25 * 60 * 60 * 1000)
  })
})
