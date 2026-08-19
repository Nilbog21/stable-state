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

  const lessonItem: CalendarFeedItem[] = [
    { itemType: 'lesson', id: 'l-1', title: 'Custom', startsAt: '2026-08-01T14:00:00Z', durationMinutes: 60, notes: null },
  ]

  it('should_render_a_lesson_event_with_begin_vevent', () => {
    const result = buildIcsFeed('Sunny Acres', lessonItem)
    expect(result).toContain('BEGIN:VEVENT')
  })

  it('should_render_a_lesson_event_with_uid', () => {
    const result = buildIcsFeed('Sunny Acres', lessonItem)
    expect(result).toContain('UID:lesson-l-1@stablestate.app')
  })

  it('should_render_a_lesson_event_with_utc_dtstart', () => {
    const result = buildIcsFeed('Sunny Acres', lessonItem)
    expect(result).toContain('DTSTART:20260801T140000Z')
  })

  it('should_render_a_lesson_event_with_utc_dtend', () => {
    const result = buildIcsFeed('Sunny Acres', lessonItem)
    expect(result).toContain('DTEND:20260801T150000Z')
  })

  it('should_render_a_lesson_event_with_summary', () => {
    const result = buildIcsFeed('Sunny Acres', lessonItem)
    expect(result).toContain('SUMMARY:Custom')
  })

  it('should_render_a_lesson_event_with_end_vevent', () => {
    const result = buildIcsFeed('Sunny Acres', lessonItem)
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

  it('should_escape_bare_carriage_returns_in_notes_as_literal_backslash_n', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title: 'Costume Party', startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: 'Line one\rLine two' },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('DESCRIPTION:Line one\\nLine two')
  })

  it('should_collapse_crlf_in_notes_to_a_single_escaped_newline', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title: 'Costume Party', startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: 'Line one\r\nLine two' },
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

  it('should_fold_lines_with_multi_byte_characters_without_exceeding_the_byte_limit', () => {
    const title = 'é'.repeat(60)
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title, startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    const lines = result.split('\r\n')
    for (const line of lines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
    const unfolded = result.replace(/\r\n /g, '')
    expect(unfolded).toContain(`SUMMARY:${title}`)
  })

  it('should_fold_lines_with_astral_characters_without_splitting_a_surrogate_pair', () => {
    // 64 B's after the 8-byte "SUMMARY:" prefix puts byte 75 exactly on the high
    // surrogate of the first emoji (a surrogate pair in UTF-16) — the fold boundary
    // that used to split the pair.
    const title = 'B'.repeat(64) + '🐴'.repeat(10)
    const items: CalendarFeedItem[] = [
      { itemType: 'event', id: 'e-1', title, startsAt: '2026-10-31T23:00:00Z', durationMinutes: 0, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).not.toContain('�')
    const unfolded = result.replace(/\r\n /g, '')
    expect(unfolded).toContain(`SUMMARY:${title}`)
  })

  // #1640: an appointment with no time is an all-day VEVENT. `startsAt` carries the raw
  // "YYYY-MM-DD" digits rather than an instant — round-tripping through a Date and back
  // would shift the day for any subscriber whose zone sits either side of UTC midnight.
  const allDayItem: CalendarFeedItem[] = [
    { itemType: 'appointment', id: 'a-1', title: 'Farrier — Dr. Hoof', startsAt: '2026-08-01', allDay: true, durationMinutes: 0, notes: null },
  ]

  it('should_render_an_all_day_item_with_a_date_valued_dtstart', () => {
    const result = buildIcsFeed('Sunny Acres', allDayItem)
    expect(result).toContain('DTSTART;VALUE=DATE:20260801')
  })

  it('should_render_an_all_day_item_with_a_dtend_on_the_following_day', () => {
    const result = buildIcsFeed('Sunny Acres', allDayItem)
    expect(result).toContain('DTEND;VALUE=DATE:20260802')
  })

  it('should_not_render_a_datetime_dtstart_for_an_all_day_item', () => {
    const result = buildIcsFeed('Sunny Acres', allDayItem)
    expect(result).not.toContain('DTSTART:')
  })

  it('should_roll_an_all_day_dtend_over_a_month_boundary', () => {
    const items: CalendarFeedItem[] = [{ ...allDayItem[0], startsAt: '2026-01-31' }]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('DTEND;VALUE=DATE:20260201')
  })

  it('should_roll_an_all_day_dtend_over_a_year_boundary', () => {
    const items: CalendarFeedItem[] = [{ ...allDayItem[0], startsAt: '2026-12-31' }]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('DTEND;VALUE=DATE:20270101')
  })

  it('should_render_an_all_day_item_with_an_appointment_uid', () => {
    const result = buildIcsFeed('Sunny Acres', allDayItem)
    expect(result).toContain('UID:appointment-a-1@stablestate.app')
  })

  it('should_render_a_timed_appointment_with_a_datetime_dtstart', () => {
    const items: CalendarFeedItem[] = [
      { itemType: 'appointment', id: 'a-2', title: 'Veterinary — Riverside Vet', startsAt: '2026-08-01T14:00:00Z', allDay: false, durationMinutes: 0, notes: null },
    ]
    const result = buildIcsFeed('Sunny Acres', items)
    expect(result).toContain('DTSTART:20260801T140000Z')
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
