/**
 * Date rendering. Two frames, per ARCHITECTURE.md's Timezone convention:
 *
 *   - `formatBarn*` render a real instant in the barn's own zone. The zone travels inside
 *     the `Instant`, so there is no argument to get wrong and no viewer frame left (#1222).
 *   - `formatShortDate`/`formatShortDateOnly` force UTC, which is correct *only* for a
 *     genuinely DATE-only value — `agreement_charges.period`, `appointments.expense_date`,
 *     a document's `reminder_date`. Never pass an instant through them.
 *
 * This module sits inside the eslint fence (`eslint.config.mjs`), which is why the
 * `Intl.DateTimeFormat` calls below are legal here and nowhere outside the date modules.
 */
import type { CalendarDate, Instant } from './db/types'

const DATE_PARTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
const TIME_PARTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

function formatInstant(instant: Instant, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: instant.tz }).format(new Date(instant.at))
}

// "Jul 15, 2026, 4:00 PM" — the barn's wall clock for this instant.
export function formatBarnDateTime(instant: Instant): string {
  return formatInstant(instant, { ...DATE_PARTS, ...TIME_PARTS })
}

// "Jul 15, 2026" — the barn's calendar day for this instant, which is not always the
// viewer's or the server host's.
export function formatBarnDate(instant: Instant): string {
  return formatInstant(instant, DATE_PARTS)
}

// "4:00 PM" — 12-hour, per the project's time-display convention.
export function formatBarnTime(instant: Instant): string {
  return formatInstant(instant, TIME_PARTS)
}

/**
 * Short-date rendering ("Jul 15, 2026", en-US, UTC) for DATE-only columns, shared by the
 * finances pages, `OutstandingTable`, `DocumentRemindersSection`, and the settings page's
 * member roster.
 */
export function formatShortDate(isoString: string): string {
  return new Intl.DateTimeFormat('en-US', { ...DATE_PARTS, timeZone: 'UTC' }).format(new Date(isoString))
}

export function formatShortDateOnly(dateOnly: CalendarDate): string {
  return formatShortDate(`${dateOnly}T00:00:00Z`)
}

// "Jul 2026" for an `agreement_charges.period` — a DATE naming a billing month, so UTC-forced
// like the two above. Lives here rather than beside its one caller so the fence has nothing
// to make an exception for.
export function formatChargePeriod(period: CalendarDate): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(period))
}
