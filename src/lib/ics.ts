import type { CalendarFeedItem } from './db/types'

const CRLF = '\r\n'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIcsDateTime(instant: string | Date): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

// RFC 5545 §3.1: content lines longer than 75 octets fold onto a continuation
// line beginning with a single space.
function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line

  const chunks: string[] = []
  let rest = line
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let end = 75
    while (end > 0 && Buffer.byteLength(rest.slice(0, end), 'utf8') > 75) end--
    chunks.push(rest.slice(0, end))
    rest = ' ' + rest.slice(end)
  }
  chunks.push(rest)
  return chunks.join(CRLF)
}

function buildEventLines(item: CalendarFeedItem, dtstamp: string): string[] {
  const dtstart = toIcsDateTime(item.startsAt)
  const dtend = toIcsDateTime(new Date(new Date(item.startsAt).getTime() + item.durationMinutes * 60_000))
  const lines = [
    'BEGIN:VEVENT',
    `UID:${item.itemType}-${item.id}@stablestate.app`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcsText(item.title)}`,
  ]
  if (item.notes) lines.push(`DESCRIPTION:${escapeIcsText(item.notes)}`)
  lines.push('END:VEVENT')
  return lines
}

export function buildIcsFeed(barnName: string, items: CalendarFeedItem[]): string {
  const dtstamp = toIcsDateTime(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StableState//Calendar Feed//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(barnName)} — My Schedule`,
    ...items.flatMap((item) => buildEventLines(item, dtstamp)),
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join(CRLF)
}
