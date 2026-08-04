// Barn-relative timezone. #1222 deleted the viewer frame entirely, so this is now the only
// frame in which a real instant is resolved: every "today"/"now" comparison against barn
// data, every date/hour a user enters, and every instant rendered back (via the `Instant`
// brand, which carries this zone with it — see `format-date.ts`). The remaining frame is
// zoneless calendar arithmetic on "YYYY-MM-DD" strings, in `local-day.ts`.
import { calendarDate } from './local-day'
import type { CalendarDate } from './db/types'

export const BARN_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain, no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
] as const

// Renders an instant as the wall-clock time it corresponds to in an IANA zone, e.g.
// "2026-07-15T08:00:00". Lets a caller compare a real instant against a naive
// "YYYY-MM-DDTHH:MM:SS" entered-local-time string (both in the same frame) without
// ever needing to encode wall-clock + zone back into an instant.
export function instantToLocalWallClock(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

// The barn's own calendar day for an instant — the crossing from the instant frame into the
// zoneless one, which is why this is a `CalendarDate` mint (#1223). Shared by `barnToday`
// below and by `expense-finances.ts`, which needs the same day for a past `occurred_at`
// rather than for now.
export function barnDay(instant: Date, timeZone: string): CalendarDate {
  return calendarDate(instantToLocalWallClock(instant, timeZone).slice(0, 10))
}

// The value every comparison against barn data measures against, and the default for any
// date input. Computed server-side and handed to Server Components' children as a prop where
// the value must match a server render.
export function barnToday(timeZone: string, now: Date = new Date()): CalendarDate {
  return barnDay(now, timeZone)
}

// Reverse of instantToLocalWallClock: what real instant does this barn-local wall-clock
// string correspond to? Guess-and-correct — treat the digits as if they were UTC, measure
// how far that guess's own wall-clock rendering in `timeZone` drifts from the input, then
// shift by that drift.
//
// It takes two passes, not one. The first sample is taken at the naive guess, which sits a
// whole UTC offset (4–5 hours here) from the truth — so on a DST transition day it can fall
// on the wrong side of the boundary and measure the wrong offset, putting a whole band of
// morning hours an hour off rather than just the skipped/repeated one. The first correction
// always lands within an hour of the truth, so re-measuring there is inside the right
// regime: two passes round-trip exactly for every wall clock that exists, in every zone in
// BARN_TIMEZONES. The single exception is the hour spring-forward skips (2am, which the
// clock jumps straight over) — no instant renders back to it, so no answer round-trips. What
// falls out is the entered wall clock minus the jump: 02:15 lands on 01:15, an hour earlier
// than entered rather than clamped to the 01:59:59 boundary. Deterministic and off by exactly
// the amount the clock itself moved, which is as defensible as any other pick for a time that
// doesn't exist — but it is not the boundary, so don't read it as one.
export function wallClockToInstant(wallClock: string, timeZone: string): Date {
  const target = new Date(wallClock + 'Z').getTime()
  const driftFrom = (guess: Date) =>
    target - new Date(instantToLocalWallClock(guess, timeZone) + 'Z').getTime()
  const naiveUtc = new Date(target)
  const firstPass = new Date(naiveUtc.getTime() + driftFrom(naiveUtc))
  return new Date(firstPass.getTime() + driftFrom(firstPass))
}
