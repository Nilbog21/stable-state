/**
 * Short-date rendering ("Jul 15, 2026", en-US, UTC) shared by the finances
 * pages, `OutstandingTable`, `DocumentRemindersSection`, and the settings
 * page's member roster — consolidated from previously per-module private
 * copies.
 */

export function formatShortDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatShortDateOnly(dateOnly: string): string {
  return formatShortDate(`${dateOnly}T00:00:00Z`)
}
