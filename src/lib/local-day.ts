// Zoneless calendar-day helpers. A "YYYY-MM-DD" string is not a real instant, so nothing
// here involves a timezone. #1222 deleted `localToday` along with the viewer frame — every
// "what day is it" question is barn-local now, and `barn-timezone.ts:barnToday` answers it.
// #1223 branded the frame: everything below deals in `CalendarDate`, not bare strings.
import type { CalendarDate } from './db/types'

// The unchecked mint — for a value the DB already types as `DATE`, and for test fixtures.
// Two other producers exist and no more: `isValidDateString` below (validating, for user
// input) and `barn-timezone.ts`'s `barnDay`/`barnToday`.
export function calendarDate(s: string): CalendarDate {
  return s as CalendarDate
}

// Validates a "YYYY-MM-DD" calendar-date string, e.g. a `?date=` search param, rejecting
// both malformed input and out-of-range values (a naive regex alone would accept "2026-02-30").
// A type predicate rather than a plain boolean, so a validated search param narrows to
// `CalendarDate` at the `if` and reaches the rest of the module without a cast.
export function isValidDateString(s: string): s is CalendarDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Pure calendar-day arithmetic on a "YYYY-MM-DD" string — not a real instant, so no
// timezone is involved (unlike wallClockToInstant, which anchors to a barn's zone).
export function addDays(date: CalendarDate, delta: number): CalendarDate {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return calendarDate(d.toISOString().slice(0, 10))
}

// The first of the month containing the given date. Pure string surgery on a "YYYY-MM-DD",
// so no timezone is involved — the caller decides *whose* day it is (barn-timezone.ts's
// `barnToday` for "this month", `barnDay` for the month a past instant fell in) and this
// only walks it back to the 1st. Not a `CalendarDate` mint: a CalendarDate goes in.
export function firstOfMonth(date: CalendarDate): CalendarDate {
  return calendarDate(date.slice(0, 8) + '01')
}

// The Sunday-start calendar week (Sun-Sat) containing the given date.
export function getWeekDates(date: CalendarDate): CalendarDate[] {
  const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay() // 0 = Sunday
  const weekStart = addDays(date, -dayOfWeek)
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

// "July 2026" for a "YYYY-MM" month key — the month calendar's heading.
export function formatMonthHeading(month: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`)
  )
}

// `start` is a barn-local wall clock ("YYYY-MM-DDTHH:mm:ss"), so it is parsed and formatted
// as UTC — the digits are displayed as given, with no conversion.
export function formatItemTime(start: string): string {
  return new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(`${start}Z`))
}

// Shared by the Day view's single heading and the Week view's per-day-cell headings.
export function formatCalendarDate(date: CalendarDate): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`)
  )
}
