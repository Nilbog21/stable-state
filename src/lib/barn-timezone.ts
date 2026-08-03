// Barn-relative timezone: every comparison against barn data resolves "today"/"now" here,
// whether it runs with a viewer present or not (cron jobs, dashboard SSR, and — via a
// server-computed prop — the client forms' own date comparisons, #1149). Display of real
// instants (lesson_at) stays viewer-local, per #935, and never reads this. An input default
// resolves here too when the day it seeds is a day of barn business (#1224 — the new-expense
// Date, the new-lease/boarding Start Date); only a default seeding the viewer's own scheduling
// choice stays viewer-local (see local-day.ts's localToday).
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

// The barn's own calendar day for an instant — the barn-local counterpart to local-day.ts's
// localToday, and the value every comparison against barn data measures against. Computed
// server-side and handed to client components as a prop; they must not re-derive it.
export function barnToday(timeZone: string, now: Date = new Date()): string {
  return instantToLocalWallClock(now, timeZone).slice(0, 10)
}

// Reverse of instantToLocalWallClock: what real instant does this barn-local wall-clock
// string correspond to? Guess-and-correct — treat the digits as if they were UTC, measure
// how far that guess's own wall-clock rendering in `timeZone` drifts from the input, then
// shift by that drift. A single correction is exact except within a DST transition window
// (a wall-clock time that's skipped or repeated), which day-boundary calculations never hit.
export function wallClockToInstant(wallClock: string, timeZone: string): Date {
  const naiveUtc = new Date(wallClock + 'Z')
  const offsetMs = naiveUtc.getTime() - new Date(instantToLocalWallClock(naiveUtc, timeZone) + 'Z').getTime()
  return new Date(naiveUtc.getTime() + offsetMs)
}
