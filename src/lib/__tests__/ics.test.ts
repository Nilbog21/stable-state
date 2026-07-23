import { describe, it, expect } from 'vitest'
import { buildIcsFeed } from '../ics'
import type { CalendarFeedItem } from '../db/types'

describe('buildIcsFeed', () => {
  it('should_produce_valid_calendar_wrapper_with_no_items', () => {
    const result = buildIcsFeed('Sunny Acres', [])
    expect(result).toContain('BEGIN:VCALENDAR')
    expect(result).toContain('VERSION:2.0')
    expect(result).toContain('END:VCALENDAR')
    expect(result).not.toContain('BEGIN:VEVENT')
  })

  it('should_include_calendar_name_from_barn_name', () => {
    const result = buildIcsFeed('Sunny Acres', [])
    expect(result).toContain('X-WR-CALNAME:Sunny Acres — My Schedule')
  })

  it('should_render_a_lesson_event_with_utc_dtstart_and_dtend', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'lesson', id: 'l-1', title: 'Custom', startsAt: '2026-08-01T14:00:00Z', durationMinutes: 60, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('BEGIN:VEVENT')
    expect(result).toContain('UID:lesson-l-1@stablestate.app')
    expect(result).toContain('DTSTART:20260801T140000Z')
    expect(result).toContain('DTEND:20260801T150000Z')
    expect(result).toContain('SUMMARY:Custom')
    expect(result).toContain('END:VEVENT')
  })

  it('should_render_a_zero_duration_event_with_matching_dtstart_and_dtend', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title: 'Costume Party', startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('DTSTART:20261031T230000Z')
    expect(result).toContain('DTEND:20261031T230000Z')
  })

  it('should_include_description_when_notes_present', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title: 'Costume Party', startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: 'Bring a costume' },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('DESCRIPTION:Bring a costume')
  })

  it('should_omit_description_when_notes_absent', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'lesson', id: 'l-1', title: 'Custom', startsAt: '2026-08-01T14:00:00Z', durationMinutes: 60, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).not.toContain('DESCRIPTION:')
  })

  it('should_escape_commas_semicolons_and_backslashes_in_text_values', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title: 'Feed, Tack; Repair\\Shed', startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('SUMMARY:Feed\\, Tack\\; Repair\\\\Shed')
  })

  it('should_escape_newlines_in_notes_as_literal_backslash_n', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title: 'Costume Party', startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: 'Line one\nLine two' },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('DESCRIPTION:Line one\\nLine two')
  })

  it('should_fold_lines_longer_than_75_octets', () => {
    const longTitle = 'A'.repeat(120)
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title: longTitle, startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    const lines = result.split('\r\n')
    for (const line of lines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
    // folded continuation lines start with a single space, per RFC 5545
    expect(result).toMatch(/\r\n {1}A/)
  })

  it('should_render_multiple_items_as_separate_vevents', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'lesson', id: 'l-1', title: 'Custom', startsAt: '2026-08-01T14:00:00Z', durationMinutes: 60, notes: null },
      { itemType: 'event', id: 'e-1', title: 'Costume Party', startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result.match(/BEGIN:VEVENT/g)).toHaveLength(2)
  })
})
