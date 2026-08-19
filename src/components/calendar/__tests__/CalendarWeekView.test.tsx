import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../CalendarDayView', () => ({
  CalendarDayView: ({ items }: { items: { id: string }[] }) => (
    <div data-testid="day-view" data-item-ids={items.map((i) => i.id).join(',')} />
  ),
}))

import { CalendarWeekView } from '../CalendarWeekView'
import { createMockLessonWithDetails } from '@/test/fixtures'
import type { DayScheduleDisplayItem } from '../dayScheduleItems'
import { calendarDate } from '@/lib/local-day'

function lessonItem(id: string): DayScheduleDisplayItem {
  return { itemType: 'lesson', id, lesson: createMockLessonWithDetails({ id }) }
}

describe('CalendarWeekView', () => {
  it('should_show_empty_state_when_every_day_has_no_items', () => {
    const days = [
      { date: calendarDate('2026-07-20'), items: [] },
      { date: calendarDate('2026-07-21'), items: [] },
    ]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-20')} role="manager" slug="green-acres" />)

    expect(screen.getByText("You're all clear")).toBeDefined()
    expect(screen.queryByTestId('day-view')).toBeNull()
  })

  it('should_show_manager_specific_empty_week_subtext', () => {
    const days = [{ date: calendarDate('2026-07-20'), items: [] }]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-20')} role="manager" slug="green-acres" />)

    expect(screen.getByText(/lessons, appointments, or events/)).toBeDefined()
  })

  it('should_show_appointment_mentioning_empty_week_subtext_for_trainer', () => {
    const days = [{ date: calendarDate('2026-07-20'), items: [] }]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-20')} role="trainer" slug="green-acres" />)

    expect(screen.getByText(/lessons, appointments, or events/)).toBeDefined()
  })

  it('should_show_generic_empty_week_subtext_for_rider', () => {
    const days = [{ date: calendarDate('2026-07-20'), items: [] }]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-20')} role="rider" slug="green-acres" />)

    expect(screen.getByText('Nothing scheduled this week.')).toBeDefined()
  })

  it('should_render_a_day_view_for_a_day_with_items', () => {
    const days = [{ date: calendarDate('2026-07-20'), items: [lessonItem('lesson-1')] }]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-20')} role="manager" slug="green-acres" />)

    expect(screen.getByTestId('day-view').getAttribute('data-item-ids')).toBe('lesson-1')
  })

  it('should_show_compact_text_for_an_empty_day_alongside_other_non_empty_days', () => {
    const days = [
      { date: calendarDate('2026-07-20'), items: [lessonItem('lesson-1')] },
      { date: calendarDate('2026-07-21'), items: [] },
    ]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-20')} role="manager" slug="green-acres" />)

    expect(screen.getByText('Nothing scheduled for this day.')).toBeDefined()
  })

  it('should_render_all_seven_day_headings_in_order', () => {
    const days = [
      { date: calendarDate('2026-07-20'), items: [lessonItem('lesson-1')] },
      { date: calendarDate('2026-07-21'), items: [] },
      { date: calendarDate('2026-07-22'), items: [] },
    ]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-20')} role="manager" slug="green-acres" />)

    const headings = screen.getAllByRole('heading')
    expect(headings).toHaveLength(3)
  })

  it('should_mark_the_day_matching_todaystr_with_a_today_suffix', () => {
    const days = [
      { date: calendarDate('2026-07-20'), items: [lessonItem('lesson-1')] },
      { date: calendarDate('2026-07-21'), items: [] },
    ]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-21')} role="manager" slug="green-acres" />)

    expect(screen.getByText(/Today/)).toBeDefined()
  })

  it('should_visually_highlight_the_section_matching_todaystr', () => {
    const days = [
      { date: calendarDate('2026-07-20'), items: [lessonItem('lesson-1')] },
      { date: calendarDate('2026-07-21'), items: [] },
    ]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-21')} role="manager" slug="green-acres" />)

    const headings = screen.getAllByRole('heading')
    const todaySection = headings[1].closest('section')
    expect(todaySection?.className).toContain('border-blue-200')
  })

  it('should_not_highlight_a_section_that_does_not_match_todaystr', () => {
    const days = [
      { date: calendarDate('2026-07-20'), items: [lessonItem('lesson-1')] },
      { date: calendarDate('2026-07-21'), items: [] },
    ]
    render(<CalendarWeekView days={days} todayStr={calendarDate('2026-07-21')} role="manager" slug="green-acres" />)

    const headings = screen.getAllByRole('heading')
    const nonTodaySection = headings[0].closest('section')
    expect(nonTodaySection?.className ?? '').not.toContain('border-blue-200')
  })
})
