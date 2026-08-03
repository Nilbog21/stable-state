// Barn-relative timezone. #1222 deleted the viewer frame entirely, so this is now the only
// frame in which a real instant is resolved: every "today"/"now" comparison against barn
// data, every date/hour a user enters, and every instant rendered back (via the `Instant`
// brand, which carries this zone with it — see `format-date.ts`). The remaining frame is
// zoneless calendar arithmetic on "YYYY-MM-DD" strings, in `local-day.ts`.
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

// The barn's own calendar day for an instant — the value every comparison against barn data
// measures against, and the default for any date input. Computed server-side and handed to
// Server Components' children as a prop where the value must match a server render.
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
