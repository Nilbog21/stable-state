// The server fetches/renders on UTC day boundaries; comparing again here
// against the viewer's local day means a reminder that isn't "today" yet in
// their timezone doesn't flash into the wrong section a day early. Server
// (SSR) and client hydration can compute `now` in different timezones, so a
// value right at the boundary could theoretically land differently between
// renders — an accepted tradeoff. Structural mismatches (a badge or section
// appearing/disappearing, e.g. ReminderDueBadge, DocumentRemindersSection)
// aren't suppressible via suppressHydrationWarning that way — React just
// re-renders client-side. (The dashboard Day view's own cards dropped this
// viewer-local "Today" comparison entirely, #1015 — every item on a Day view
// already belongs to the one day its heading names, computed once from
// `barns.timezone`, so a per-item re-derivation of "is this today" in the
// viewer's own zone was redundant and could disagree with that heading.)
// Despite the name, an explicit argument makes this "the viewer-local calendar day of that
// instant" — `isSameLocalDay` below and the lesson/event forms' initial-date decode rely on it.
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function isSameLocalDay(date: Date, now: Date): boolean {
  return localToday(date) === localToday(now)
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
