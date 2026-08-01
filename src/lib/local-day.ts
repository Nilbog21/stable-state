// The viewer's own calendar day. #1149 settled which half of the app this belongs to, and
// #1224 sharpened the second line — "input default" was too broad a category:
//
//   Comparisons against barn data are barn-local (`barnToday`, src/lib/barn-timezone.ts),
//   and so is an input default seeding a day of barn business (the new-expense Date, the
//   new-lease/boarding Start Date). Only a default seeding the viewer's own scheduling
//   choice stays viewer-local (here).
//
// So the remaining callers are the ones where the viewer's calendar is the right frame: the
// default date for a new lesson (DateHourPicker), and which month the lesson form's calendar
// opens on. Despite the name, an explicit argument makes this "the viewer-local calendar day of
// that instant", which is also how the lesson/event forms decode a stored `lesson_at`/`event_at`
// back into an initial date. Never use it to decide whether a barn-local date is past or due —
// that lands a day off for any viewer whose device zone differs from `barns.timezone`.
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

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
