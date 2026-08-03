// Zoneless calendar-day helpers. A "YYYY-MM-DD" string is not a real instant, so nothing
// here involves a timezone. #1222 deleted `localToday` along with the viewer frame — every
// "what day is it" question is barn-local now, and `barn-timezone.ts:barnToday` answers it.

// Validates a "YYYY-MM-DD" calendar-date string, e.g. a `?date=` search param, rejecting
// both malformed input and out-of-range values (a naive regex alone would accept "2026-02-30").
export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Pure calendar-day arithmetic on a "YYYY-MM-DD" string — not a real instant, so no
// timezone is involved (unlike wallClockToInstant, which anchors to a barn's zone).
export function addDays(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// The Sunday-start calendar week (Sun-Sat) containing the given date.
export function getWeekDates(date: string): string[] {
  const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay() // 0 = Sunday
  const weekStart = addDays(date, -dayOfWeek)
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

// Shared by the Day view's single heading and the Week view's per-day-cell headings.
export function formatCalendarDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`)
  )
}
