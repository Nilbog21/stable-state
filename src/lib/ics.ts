/**
 * RFC 5545 renderer behind the `/calendar.ics` feed: `buildIcsFeed` (the sole export)
 * renders a barn name plus already-fetched `CalendarFeedItem[]` into a VCALENDAR string —
 * UTC `DTSTART`/`DTEND` (end = start + `durationMinutes`), a per-item `UID`, RFC-escaped
 * text (`escapeIcsText` normalizes CRLF/bare-CR line endings first), and 75-octet
 * content-line folding that never splits a UTF-16 surrogate pair. Pure string building —
 * the fetch and token check live in `calendar-feed.ts:getCalendarFeedData`, and
 * `src/app/calendar.ics/route.ts` composes the two.
 */
import type { CalendarFeedItem } from './db/types'
import { addDays, calendarDate } from './local-day'

const CRLF = '\r\n'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIcsDateTime(instant: string | Date): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// RFC 5545 §3.3.4: a DATE value is the bare "YYYYMMDD" digits, no time and no Z. Built by
// stripping the hyphens rather than by formatting a Date — parsing the day into an instant and
// reading it back is exactly the round trip that shifts the day near a zone boundary, which is
// why the RPC hands these digits straight through (#1640). `addDays` is UTC-anchored string
// arithmetic for the same reason.
function toIcsDate(day: string): string {
  return day.replace(/-/g, '')
}

function escapeIcsText(text: string): string {
  return text
    // Normalize CRLF/bare-CR line endings to \n first — RFC 5545 has no separate escape
    // for a raw carriage return, and leaving one unescaped can read as a stray line
    // terminator to a strict parser.
    .replace(/\r\n?/g, '\n')
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
    // Don't split a UTF-16 surrogate pair (astral character, e.g. emoji) across the fold
    // boundary — if `end` lands between a high surrogate and its low-surrogate partner,
    // back off one more so the whole pair moves to the next line.
    const code = rest.charCodeAt(end - 1)
    if (end > 1 && code >= 0xd800 && code <= 0xdbff) end--
    chunks.push(rest.slice(0, end))
    rest = ' ' + rest.slice(end)
  }
  chunks.push(rest)
  return chunks.join(CRLF)
}

function buildEventLines(item: CalendarFeedItem, dtstamp: string): string[] {
  // DTEND is exclusive for an all-day event, so a one-day item ends on the following day.
  const dateLines = item.allDay
    ? [
        `DTSTART;VALUE=DATE:${toIcsDate(item.startsAt)}`,
        `DTEND;VALUE=DATE:${toIcsDate(addDays(calendarDate(item.startsAt), 1))}`,
      ]
    : [
        `DTSTART:${toIcsDateTime(item.startsAt)}`,
        `DTEND:${toIcsDateTime(new Date(new Date(item.startsAt).getTime() + item.durationMinutes * 60_000))}`,
      ]
  const lines = [
    'BEGIN:VEVENT',
    `UID:${item.itemType}-${item.id}@stablestate.app`,
    `DTSTAMP:${dtstamp}`,
    ...dateLines,
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
