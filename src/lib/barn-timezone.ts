// Barn-relative timezone: used only by server-side comparisons that run with no
// request/viewer context (cron jobs, dashboard SSR) — e.g. "is this planned expense
// past due". Display of real instants (lesson_at) stays viewer-local, per #935, and
// never reads this.
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
