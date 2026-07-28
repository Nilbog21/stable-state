import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../CalendarLessonCard', () => ({
  CalendarLessonCard: ({ lesson, role, slug, viewerMembershipId }: { lesson: { id: string }; role: string; slug: string; viewerMembershipId?: string }) => (
    <div data-testid="lesson-card" data-lesson-id={lesson.id} data-role={role} data-slug={slug} data-viewer-membership-id={viewerMembershipId} />
  ),
}))

vi.mock('../CalendarExpenseCard', () => ({
  CalendarExpenseCard: ({ expense, slug, role }: { expense: { id: string }; slug: string; role: string }) => (
    <div data-testid="expense-card" data-expense-id={expense.id} data-slug={slug} data-role={role} />
  ),
}))

vi.mock('../CalendarEventCard', () => ({
  CalendarEventCard: ({ event }: { event: { id: string } }) => (
    <div data-testid="event-card" data-event-id={event.id} />
  ),
}))

import { CalendarDayView } from '../CalendarDayView'
import { createMockLessonWithDetails, makeExpense, createMockBarnEvent } from '@/test/fixtures'
import type { DayScheduleDisplayItem } from '../dayScheduleItems'

describe('CalendarDayView', () => {
  it('should_show_empty_state_when_no_items', () => {
    render(<CalendarDayView items={[]} role="manager" slug="green-acres" />)
    expect(screen.getByText("You're all clear")).toBeDefined()
  })

  it('should_show_manager_specific_empty_subtext', () => {
    render(<CalendarDayView items={[]} role="manager" slug="green-acres" />)
    expect(screen.getByText(/lessons, expenses, or events/)).toBeDefined()
  })

  it('should_show_expense_mentioning_empty_subtext_for_trainer', () => {
    render(<CalendarDayView items={[]} role="trainer" slug="green-acres" />)
    expect(screen.getByText(/lessons, expenses, or events/)).toBeDefined()
  })

  it('should_show_generic_empty_subtext_for_rider', () => {
    render(<CalendarDayView items={[]} role="rider" slug="green-acres" />)
    expect(screen.getByText('Nothing scheduled for this day.')).toBeDefined()
  })

  it('should_render_a_lesson_card_for_a_lesson_item', () => {
    const lesson = createMockLessonWithDetails({ id: 'lesson-1' })
    const items: DayScheduleDisplayItem[] = [{ itemType: 'lesson', id: 'lesson-1', lesson }]
    render(<CalendarDayView items={items} role="manager" slug="green-acres" />)

    expect(screen.getByTestId('lesson-card').getAttribute('data-lesson-id')).toBe('lesson-1')
  })

  it('should_render_an_expense_card_for_an_expense_item', () => {
    const expense = makeExpense({ id: 'expense-1' })
    const items: DayScheduleDisplayItem[] = [{ itemType: 'expense', id: 'expense-1', expense }]
    render(<CalendarDayView items={items} role="manager" slug="green-acres" />)

    expect(screen.getByTestId('expense-card').getAttribute('data-expense-id')).toBe('expense-1')
  })

  it('should_pass_role_to_the_expense_card', () => {
    const expense = makeExpense({ id: 'expense-1' })
    const items: DayScheduleDisplayItem[] = [{ itemType: 'expense', id: 'expense-1', expense }]
    render(<CalendarDayView items={items} role="trainer" slug="green-acres" />)

    expect(screen.getByTestId('expense-card').getAttribute('data-role')).toBe('trainer')
  })

  it('should_render_an_event_card_for_an_event_item', () => {
    const event = createMockBarnEvent({ id: 'event-1' })
    const items: DayScheduleDisplayItem[] = [{ itemType: 'event', id: 'event-1', event }]
    render(<CalendarDayView items={items} role="manager" slug="green-acres" />)

    expect(screen.getByTestId('event-card').getAttribute('data-event-id')).toBe('event-1')
  })

  it('should_pass_role_to_lesson_card', () => {
    const lesson = createMockLessonWithDetails({ id: 'lesson-1' })
    const items: DayScheduleDisplayItem[] = [{ itemType: 'lesson', id: 'lesson-1', lesson }]
    render(<CalendarDayView items={items} role="rider" slug="green-acres" viewerMembershipId="mem-1" />)

    expect(screen.getByTestId('lesson-card').getAttribute('data-role')).toBe('rider')
  })

  it('should_pass_viewer_membership_id_to_lesson_card', () => {
    const lesson = createMockLessonWithDetails({ id: 'lesson-1' })
    const items: DayScheduleDisplayItem[] = [{ itemType: 'lesson', id: 'lesson-1', lesson }]
    render(<CalendarDayView items={items} role="rider" slug="green-acres" viewerMembershipId="mem-1" />)

    expect(screen.getByTestId('lesson-card').getAttribute('data-viewer-membership-id')).toBe('mem-1')
  })

  it('should_render_multiple_items_in_order', () => {
    const lesson = createMockLessonWithDetails({ id: 'lesson-1' })
    const expense = makeExpense({ id: 'expense-1' })
    const items: DayScheduleDisplayItem[] = [
      { itemType: 'expense', id: 'expense-1', expense },
      { itemType: 'lesson', id: 'lesson-1', lesson },
    ]
    render(<CalendarDayView items={items} role="manager" slug="green-acres" />)

    const cards = screen.getAllByTestId(/(lesson|expense)-card/)
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual(['expense-card', 'lesson-card'])
  })
})
