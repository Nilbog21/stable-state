// The server fetches/renders on UTC day boundaries; comparing again here
// against the viewer's local day means a lesson/expense/reminder that isn't
// "today" yet in their timezone doesn't flash into the wrong section a day
// early. Server (SSR) and client hydration can compute `now` in different
// timezones, so a value right at the boundary could theoretically land
// differently between renders — an accepted tradeoff. Text-only mismatches
// (UpcomingLessonCard, UpcomingExpenseCard) are paired with
// suppressHydrationWarning; structural mismatches (a badge or section
// appearing/disappearing, e.g. ReminderDueBadge, DocumentRemindersSection,
// the UpcomingLessonsSections Today/This Week split) aren't suppressible
// that way — React just re-renders client-side.
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
