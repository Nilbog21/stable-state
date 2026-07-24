import { describe, it, expect } from 'vitest'
import { createMockLessonWithDetails, createMockExpenseWithHorses, createMockBarnEvent } from '@/test/fixtures'
import { mergeDayScheduleDisplayItems, groupScheduleItemsByDay } from '../dayScheduleItems'
import type { ScheduleItem } from '@/lib/db/types'

function scheduleItem(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: 'item-1',
    itemType: 'lesson',
    start: '2026-07-23T09:00:00',
    durationMinutes: 60,
    instructorId: null,
    horseIds: [],
    ...overrides,
  }
}

describe('mergeDayScheduleDisplayItems', () => {
  it('should_return_empty_array_when_no_items', () => {
    expect(mergeDayScheduleDisplayItems([], [], [], [])).toEqual([])
  })

  it('should_resolve_a_lesson_item_against_the_lessons_list', () => {
    const lesson = createMockLessonWithDetails({ id: 'lesson-1' })
    const items = [scheduleItem({ id: 'lesson-1', itemType: 'lesson' })]

    const result = mergeDayScheduleDisplayItems(items, [lesson], [], [])

    expect(result).toEqual([{ itemType: 'lesson', id: 'lesson-1', lesson }])
  })

  it('should_resolve_an_expense_item_against_the_expenses_list', () => {
    const expense = createMockExpenseWithHorses({ id: 'expense-1' })
    const items = [scheduleItem({ id: 'expense-1', itemType: 'expense' })]

    const result = mergeDayScheduleDisplayItems(items, [], [expense], [])

    expect(result).toEqual([{ itemType: 'expense', id: 'expense-1', expense }])
  })

  it('should_resolve_an_event_item_against_the_events_list', () => {
    const event = createMockBarnEvent({ id: 'event-1' })
    const items = [scheduleItem({ id: 'event-1', itemType: 'event' })]

    const result = mergeDayScheduleDisplayItems(items, [], [], [event])

    expect(result).toEqual([{ itemType: 'event', id: 'event-1', event }])
  })

  it('should_preserve_the_input_item_order', () => {
    const lesson = createMockLessonWithDetails({ id: 'lesson-1' })
    const expense = createMockExpenseWithHorses({ id: 'expense-1' })
    const items = [
      scheduleItem({ id: 'expense-1', itemType: 'expense' }),
      scheduleItem({ id: 'lesson-1', itemType: 'lesson' }),
    ]

    const result = mergeDayScheduleDisplayItems(items, [lesson], [expense], [])

    expect(result.map((r) => r.id)).toEqual(['expense-1', 'lesson-1'])
  })

  it('should_drop_an_item_with_no_matching_hydrated_row', () => {
    // This is how the "planned expenses only" filter gets applied: the caller only passes
    // in expenses that survived that filter, so a filtered-out expense's id just won't resolve.
    const items = [scheduleItem({ id: 'expense-paid', itemType: 'expense' })]

    const result = mergeDayScheduleDisplayItems(items, [], [], [])

    expect(result).toEqual([])
  })
})

describe('groupScheduleItemsByDay', () => {
  const dates = ['2026-07-20', '2026-07-21', '2026-07-22']

  it('should_return_one_bucket_per_date_even_when_empty', () => {
    const result = groupScheduleItemsByDay(dates, [], [], [], [])

    expect(result).toEqual([
      { date: '2026-07-20', items: [] },
      { date: '2026-07-21', items: [] },
      { date: '2026-07-22', items: [] },
    ])
  })

  it('should_bucket_an_item_into_the_day_matching_its_start_date', () => {
    const lesson = createMockLessonWithDetails({ id: 'lesson-1' })
    const items = [scheduleItem({ id: 'lesson-1', itemType: 'lesson', start: '2026-07-21T09:00:00' })]

    const result = groupScheduleItemsByDay(dates, items, [lesson], [], [])

    expect(result).toEqual([
      { date: '2026-07-20', items: [] },
      { date: '2026-07-21', items: [{ itemType: 'lesson', id: 'lesson-1', lesson }] },
      { date: '2026-07-22', items: [] },
    ])
  })

  it('should_drop_an_item_whose_start_date_falls_outside_the_given_dates', () => {
    const lesson = createMockLessonWithDetails({ id: 'lesson-1' })
    const items = [scheduleItem({ id: 'lesson-1', itemType: 'lesson', start: '2026-08-01T09:00:00' })]

    const result = groupScheduleItemsByDay(dates, items, [lesson], [], [])

    expect(result.flatMap((bucket) => bucket.items)).toEqual([])
  })
})
