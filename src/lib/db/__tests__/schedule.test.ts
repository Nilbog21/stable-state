import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson, createMockHorseExpense, createMockBarnEvent } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getScheduleForRange, mergeScheduleItems, intervalsOverlap, isLessonNearby, getNearbyInstructorMembershipIds, scopeScheduleItemsForRole, LESSON_DURATION_MINUTES } from '../schedule'
import type { ScheduleItem } from '../types'

describe('mergeScheduleItems', () => {
  it('should_return_empty_array_when_both_inputs_are_empty', () => {
    expect(mergeScheduleItems([], [])).toEqual([])
  })

  it('should_map_a_lesson_row_to_a_schedule_item_with_60_minute_duration', () => {
    const result = mergeScheduleItems(
      [{ id: 'lesson-1', start: '2026-06-10T10:00:00', instructor_id: 'mem-1', horse_ids: [] }],
      []
    )

    expect(result[0].durationMinutes).toBe(LESSON_DURATION_MINUTES)
  })

  it('should_map_a_lesson_row_with_lesson_item_type', () => {
    const result = mergeScheduleItems(
      [{ id: 'lesson-1', start: '2026-06-10T10:00:00', instructor_id: 'mem-1', horse_ids: [] }],
      []
    )

    expect(result[0].itemType).toBe('lesson')
  })

  it('should_map_an_expense_row_to_a_schedule_item_with_zero_duration', () => {
    const result = mergeScheduleItems(
      [],
      [{ id: 'expense-1', start: '2026-06-10T10:00:00', horse_ids: [] }]
    )

    expect(result[0].durationMinutes).toBe(0)
  })

  it('should_map_an_expense_row_with_expense_item_type', () => {
    const result = mergeScheduleItems(
      [],
      [{ id: 'expense-1', start: '2026-06-10T10:00:00', horse_ids: [] }]
    )

    expect(result[0].itemType).toBe('expense')
  })

  it('should_set_instructor_id_null_on_an_expense_item', () => {
    const result = mergeScheduleItems(
      [],
      [{ id: 'expense-1', start: '2026-06-10T10:00:00', horse_ids: [] }]
    )

    expect(result[0].instructorId).toBeNull()
  })

  it('should_include_horse_ids_on_a_lesson_item', () => {
    const result = mergeScheduleItems(
      [{ id: 'lesson-1', start: '2026-06-10T10:00:00', instructor_id: null, horse_ids: ['horse-1'] }],
      []
    )

    expect(result[0].horseIds).toEqual(['horse-1'])
  })

  it('should_include_horse_ids_on_an_expense_item', () => {
    const result = mergeScheduleItems(
      [],
      [{ id: 'expense-1', start: '2026-06-10T10:00:00', horse_ids: ['horse-1'] }]
    )

    expect(result[0].horseIds).toEqual(['horse-1'])
  })

  it('should_sort_merged_items_by_start_ascending', () => {
    const result = mergeScheduleItems(
      [{ id: 'lesson-1', start: '2026-06-15T10:00:00', instructor_id: null, horse_ids: [] }],
      [{ id: 'expense-1', start: '2026-06-01T10:00:00', horse_ids: [] }]
    )

    expect(result.map((r) => r.id)).toEqual(['expense-1', 'lesson-1'])
  })

  it('should_map_an_event_row_to_a_schedule_item_with_zero_duration', () => {
    const result = mergeScheduleItems([], [], [{ id: 'event-1', start: '2026-06-10T10:00:00' }])

    expect(result[0].durationMinutes).toBe(0)
  })

  it('should_map_an_event_row_with_event_item_type', () => {
    const result = mergeScheduleItems([], [], [{ id: 'event-1', start: '2026-06-10T10:00:00' }])

    expect(result[0].itemType).toBe('event')
  })

  it('should_set_instructor_id_null_on_an_event_item', () => {
    const result = mergeScheduleItems([], [], [{ id: 'event-1', start: '2026-06-10T10:00:00' }])

    expect(result[0].instructorId).toBeNull()
  })

  it('should_set_empty_horse_ids_on_an_event_item', () => {
    const result = mergeScheduleItems([], [], [{ id: 'event-1', start: '2026-06-10T10:00:00' }])

    expect(result[0].horseIds).toEqual([])
  })

  it('should_sort_lesson_expense_and_event_items_together_by_start_ascending', () => {
    const result = mergeScheduleItems(
      [{ id: 'lesson-1', start: '2026-06-15T10:00:00', instructor_id: null, horse_ids: [] }],
      [{ id: 'expense-1', start: '2026-06-01T10:00:00', horse_ids: [] }],
      [{ id: 'event-1', start: '2026-06-10T10:00:00' }]
    )

    expect(result.map((r) => r.id)).toEqual(['expense-1', 'event-1', 'lesson-1'])
  })

  it('should_break_a_tie_on_identical_start_by_id_ascending', () => {
    const result = mergeScheduleItems(
      [
        { id: 'lesson-b', start: '2026-06-15T10:00:00', instructor_id: null, horse_ids: [] },
        { id: 'lesson-a', start: '2026-06-15T10:00:00', instructor_id: null, horse_ids: [] },
      ],
      []
    )

    expect(result.map((r) => r.id)).toEqual(['lesson-a', 'lesson-b'])
  })
})

describe('intervalsOverlap', () => {
  const lesson = (start: string): Parameters<typeof intervalsOverlap>[0] => ({
    id: 'lesson', itemType: 'lesson', start, durationMinutes: LESSON_DURATION_MINUTES, instructorId: null, horseIds: [],
  })
  const point = (start: string): Parameters<typeof intervalsOverlap>[0] => ({
    id: 'expense', itemType: 'expense', start, durationMinutes: 0, instructorId: null, horseIds: [],
  })

  it('should_return_true_when_two_lessons_fully_overlap', () => {
    expect(intervalsOverlap(lesson('2026-06-10T09:00:00'), lesson('2026-06-10T09:00:00'))).toBe(true)
  })

  it('should_return_true_when_one_lesson_starts_during_another', () => {
    expect(intervalsOverlap(lesson('2026-06-10T09:00:00'), lesson('2026-06-10T09:30:00'))).toBe(true)
  })

  it('should_return_false_when_lessons_are_fully_separate', () => {
    expect(intervalsOverlap(lesson('2026-06-10T09:00:00'), lesson('2026-06-10T11:00:00'))).toBe(false)
  })

  it('should_return_false_when_one_lesson_ends_exactly_when_another_starts', () => {
    expect(intervalsOverlap(lesson('2026-06-10T09:00:00'), lesson('2026-06-10T10:00:00'))).toBe(false)
  })

  it('should_return_true_when_a_point_in_time_expense_falls_inside_a_lesson_window', () => {
    expect(intervalsOverlap(lesson('2026-06-10T09:00:00'), point('2026-06-10T09:30:00'))).toBe(true)
  })

  it('should_return_false_when_a_point_in_time_expense_falls_exactly_at_a_lesson_end_boundary', () => {
    expect(intervalsOverlap(lesson('2026-06-10T09:00:00'), point('2026-06-10T10:00:00'))).toBe(false)
  })

  it('should_return_false_when_two_point_in_time_items_have_different_times', () => {
    expect(intervalsOverlap(point('2026-06-10T09:00:00'), point('2026-06-10T09:01:00'))).toBe(false)
  })

  it('should_return_false_when_two_point_in_time_items_share_the_exact_same_time', () => {
    // Zero-length intervals never satisfy the strict half-open comparison, even at
    // the identical instant — consistent with the general boundary rule above.
    expect(intervalsOverlap(point('2026-06-10T09:00:00'), point('2026-06-10T09:00:00'))).toBe(false)
  })

  it('should_be_unaffected_by_the_host_process_timezone_observing_dst', () => {
    // Regression: item.start has no zone suffix, so parsing it naively (new Date(item.start),
    // no explicit 'Z') is interpreted as local-to-the-host-process time. On a DST-observing
    // host TZ, two items straddling a spring-forward transition would then get parsed with
    // different UTC offsets, corrupting the comparison. Forcing UTC parsing sidesteps this
    // regardless of host TZ.
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      // US spring-forward 2026: 2:00 AM -> 3:00 AM on 2026-03-08.
      expect(intervalsOverlap(lesson('2026-03-08T01:30:00'), lesson('2026-03-08T03:00:00'))).toBe(false)
    } finally {
      process.env.TZ = originalTz
    }
  })
})

describe('isLessonNearby', () => {
  const buffer = 30 // LESSON_DURATION_MINUTES (60) + buffer = 90 min threshold

  it('should_return_false_when_lessons_are_exactly_duration_plus_buffer_apart', () => {
    expect(isLessonNearby('2026-06-10T09:00:00.000Z', '2026-06-10T10:30:00.000Z', buffer)).toBe(false)
  })

  it('should_return_true_when_lessons_are_one_millisecond_under_duration_plus_buffer_apart', () => {
    expect(isLessonNearby('2026-06-10T09:00:00.000Z', '2026-06-10T10:29:59.999Z', buffer)).toBe(true)
  })

  it('should_return_true_when_lessons_actually_overlap', () => {
    expect(isLessonNearby('2026-06-10T09:00:00.000Z', '2026-06-10T09:30:00.000Z', buffer)).toBe(true)
  })

  it('should_return_true_when_lessons_share_the_exact_same_instant', () => {
    expect(isLessonNearby('2026-06-10T09:00:00.000Z', '2026-06-10T09:00:00.000Z', buffer)).toBe(true)
  })

  it('should_return_false_when_lessons_are_far_apart', () => {
    expect(isLessonNearby('2026-06-10T09:00:00.000Z', '2026-06-10T15:00:00.000Z', buffer)).toBe(false)
  })
})

describe('getNearbyInstructorMembershipIds', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const barnId = 'barn-1'
  const excludeLessonId = 'lesson-new'
  const lessonAt = '2026-06-10T09:00:00.000Z'
  const excludeInstructorId = 'mem-self'
  const buffer = 30

  // lessons query: select → eq(barn_id) → is(cancelled_at) → not(instructor_id) → neq(id) → gte → lt → resolves
  function makeLessonsChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNeq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockNot = vi.fn().mockReturnValue({ neq: mockNeq })
    const mockIs = vi.fn().mockReturnValue({ not: mockNot })
    const mockEq = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIs, mockNot, mockNeq, mockGte, mockLt }
  }

  it('should_return_empty_array_when_no_nearby_lessons', async () => {
    const { select } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(result).toEqual([])
  })

  it('should_return_the_instructor_id_of_a_nearby_lesson', async () => {
    const { select } = makeLessonsChain([{ id: 'lesson-2', instructor_id: 'mem-other', lesson_at: '2026-06-10T09:30:00.000Z' }])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(result).toEqual(['mem-other'])
  })

  it('should_exclude_the_provided_instructor_id_from_results', async () => {
    const { select } = makeLessonsChain([{ id: 'lesson-2', instructor_id: excludeInstructorId, lesson_at: '2026-06-10T09:30:00.000Z' }])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(result).toEqual([])
  })

  it('should_dedupe_multiple_nearby_lessons_from_the_same_instructor', async () => {
    const { select } = makeLessonsChain([
      { id: 'lesson-2', instructor_id: 'mem-other', lesson_at: '2026-06-10T09:15:00.000Z' },
      { id: 'lesson-3', instructor_id: 'mem-other', lesson_at: '2026-06-10T09:45:00.000Z' },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(result).toEqual(['mem-other'])
  })

  it('should_apply_the_precise_isLessonNearby_filter_excluding_a_row_at_the_boundary', async () => {
    // Defense-in-depth over the DB-level bound: a row exactly duration+buffer apart should
    // never count as nearby, even if it were returned by the query.
    const { select } = makeLessonsChain([{ id: 'lesson-2', instructor_id: 'mem-other', lesson_at: '2026-06-10T10:30:00.000Z' }])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(result).toEqual([])
  })

  it('should_scope_the_query_to_barn_id', async () => {
    const { select, mockEq } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(mockEq).toHaveBeenCalledWith('barn_id', barnId)
  })

  it('should_exclude_cancelled_lessons_at_the_query_level', async () => {
    const { select, mockIs } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(mockIs).toHaveBeenCalledWith('cancelled_at', null)
  })

  it('should_exclude_the_provided_lesson_id_at_the_query_level', async () => {
    const { select, mockNeq } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(mockNeq).toHaveBeenCalledWith('id', excludeLessonId)
  })

  it('should_use_injected_client_when_provided', async () => {
    const { select } = makeLessonsChain([])
    const injectedClient = { from: vi.fn().mockReturnValue({ select }) } as any

    await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer, injectedClient)

    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_treat_null_data_as_empty', async () => {
    const { select } = makeLessonsChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeLessonsChain(null, new Error('lessons error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(
      getNearbyInstructorMembershipIds(barnId, excludeLessonId, lessonAt, excludeInstructorId, buffer)
    ).rejects.toThrow('lessons error')
  })
})

describe('scopeScheduleItemsForRole', () => {
  const lessonItem = (id: string, instructorId: string | null): ScheduleItem => ({
    id, itemType: 'lesson', start: '2026-06-10T09:00:00', durationMinutes: 60, instructorId, horseIds: [],
  })
  const expenseItem = (id: string): ScheduleItem => ({
    id, itemType: 'expense', start: '2026-06-10T09:00:00', durationMinutes: 0, instructorId: null, horseIds: [],
  })

  it('should_pass_through_all_items_unchanged_for_manager', () => {
    const items = [lessonItem('lesson-1', 'mem-other'), expenseItem('expense-1')]

    expect(scopeScheduleItemsForRole(items, 'manager', 'mem-self')).toEqual(items)
  })

  it('should_pass_through_all_items_unchanged_for_rider', () => {
    const items = [lessonItem('lesson-1', 'mem-other'), expenseItem('expense-1')]

    expect(scopeScheduleItemsForRole(items, 'rider', 'mem-self')).toEqual(items)
  })

  it('should_keep_only_lessons_instructed_by_the_caller_for_trainer', () => {
    const own = lessonItem('lesson-1', 'mem-self')
    const other = lessonItem('lesson-2', 'mem-other')

    expect(scopeScheduleItemsForRole([own, other], 'trainer', 'mem-self')).toEqual([own])
  })

  it('should_keep_non_lesson_items_for_trainer_regardless_of_instructor', () => {
    const expense = expenseItem('expense-1')

    expect(scopeScheduleItemsForRole([expense], 'trainer', 'mem-self')).toEqual([expense])
  })

  it('should_drop_a_lesson_with_no_instructor_for_trainer', () => {
    const unassigned = lessonItem('lesson-1', null)

    expect(scopeScheduleItemsForRole([unassigned], 'trainer', 'mem-self')).toEqual([])
  })
})

describe('getScheduleForRange', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const from = '2026-07-01T00:00:00.000Z'
  const to = '2026-07-08T00:00:00.000Z'
  const timezone = 'America/New_York'

  // lessons query: select → eq(barn_id) → is(cancelled_at) → gte → lt → resolves
  function makeLessonsChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockIs = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIs, mockGte, mockLt }
  }

  // lesson_horses junction (getLessonJunctionRows): select → eq(barn_id) → in(lesson_id) → resolves
  function makeLessonHorsesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockIn }
  }

  // lesson_riders junction: select → eq(barn_id) → in(lesson_id) → resolves
  function makeLessonRidersChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockIn }
  }

  // expenses query: select → eq(barn_id) → not(expense_time) → gte(expense_date) → lte(expense_date) → resolves
  function makeExpensesChain(data: unknown[] | null, error: Error | null = null) {
    const mockLte = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lte: mockLte })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockNot, mockGte, mockLte }
  }

  // expense_horses junction: select → eq(barn_id) → in(expense_id) → resolves
  function makeExpenseHorsesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockIn }
  }

  // barn_events query: select → eq(barn_id) → gte(event_at) → lt(event_at) → resolves
  function makeEventsChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockGte, mockLt }
  }

  function makeFrom({
    lessons = [],
    lessonHorses = [],
    lessonRiders = [],
    expenses = [],
    expenseHorses = [],
    events = [],
    lessonsError = null,
    expensesError = null,
    lessonHorsesError = null,
    lessonRidersError = null,
    expenseHorsesError = null,
    eventsError = null,
  }: {
    lessons?: unknown[] | null
    lessonHorses?: unknown[] | null
    lessonRiders?: unknown[] | null
    expenses?: unknown[] | null
    expenseHorses?: unknown[] | null
    events?: unknown[] | null
    lessonsError?: Error | null
    expensesError?: Error | null
    lessonHorsesError?: Error | null
    lessonRidersError?: Error | null
    expenseHorsesError?: Error | null
    eventsError?: Error | null
  } = {}) {
    return vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain(lessons, lessonsError)
      if (table === 'lesson_horses') return makeLessonHorsesChain(lessonHorses, lessonHorsesError)
      if (table === 'lesson_riders') return makeLessonRidersChain(lessonRiders, lessonRidersError)
      if (table === 'horse_expenses') return makeExpensesChain(expenses, expensesError)
      if (table === 'expense_horses') return makeExpenseHorsesChain(expenseHorses, expenseHorsesError)
      if (table === 'barn_events') return makeEventsChain(events, eventsError)
      throw new Error(`unexpected table: ${table}`)
    })
  }

  it('should_return_empty_array_when_no_lessons_or_expenses_in_range', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom() } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result).toEqual([])
  })

  it('should_return_lesson_items_only_when_only_lessons_exist_in_range', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ lessons: [lesson] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result.map((r) => r.itemType)).toEqual(['lesson'])
  })

  it('should_return_expense_items_only_when_only_expenses_exist_in_range', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-03', expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ expenses: [expense] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result.map((r) => r.itemType)).toEqual(['expense'])
  })

  it('should_return_merged_lesson_and_expense_items_for_a_mixed_range', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-03', expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ lessons: [lesson], expenses: [expense] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result.map((r) => r.id).sort()).toEqual(['expense-1', 'lesson-1'])
  })

  it('should_exclude_cancelled_lessons_at_the_query_level', async () => {
    const { select, mockIs } = makeLessonsChain([])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return { select }
      return makeFrom()(table)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getScheduleForRange('barn-1', from, to, timezone)

    expect(mockIs).toHaveBeenCalledWith('cancelled_at', null)
  })

  it('should_exclude_expenses_with_null_expense_time_at_the_query_level', async () => {
    const { select, mockNot } = makeExpensesChain([])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { select }
      return makeFrom()(table)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getScheduleForRange('barn-1', from, to, timezone)

    expect(mockNot).toHaveBeenCalledWith('expense_time', 'is', null)
  })

  it('should_use_injected_client_when_provided', async () => {
    const injectedClient = { from: makeFrom() } as any

    await getScheduleForRange('barn-1', from, to, timezone, injectedClient)

    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_not_fetch_lesson_horse_junction_rows_when_no_lesson_rows', async () => {
    const fromFn = makeFrom()
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getScheduleForRange('barn-1', from, to, timezone)

    expect(fromFn).not.toHaveBeenCalledWith('lesson_horses')
  })

  it('should_not_fetch_expense_horse_junction_rows_when_no_expense_rows', async () => {
    const fromFn = makeFrom()
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getScheduleForRange('barn-1', from, to, timezone)

    expect(fromFn).not.toHaveBeenCalledWith('expense_horses')
  })

  it('should_include_lesson_horse_ids_resolved_from_the_junction_table', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ lessons: [lesson], lessonHorses: [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }] }),
    } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].horseIds).toEqual(['horse-1'])
  })

  it('should_include_expense_horse_ids_resolved_from_the_junction_table', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-03', expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ expenses: [expense], expenseHorses: [{ expense_id: 'expense-1', horse_id: 'horse-1' }] }),
    } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].horseIds).toEqual(['horse-1'])
  })

  it('should_exclude_an_expense_dated_before_the_window', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-06-20', expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ expenses: [expense] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result).toEqual([])
  })

  it('should_throw_when_the_lessons_query_rejects', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ lessons: null, lessonsError: new Error('lessons error') }) } as any)

    await expect(getScheduleForRange('barn-1', from, to, timezone)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_the_lesson_horse_junction_query_rejects', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ lessons: [lesson], lessonHorses: null, lessonHorsesError: new Error('junction error') }),
    } as any)

    await expect(getScheduleForRange('barn-1', from, to, timezone)).rejects.toThrow('junction error')
  })

  it('should_throw_when_the_expenses_query_rejects', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ expenses: null, expensesError: new Error('expenses error') }) } as any)

    await expect(getScheduleForRange('barn-1', from, to, timezone)).rejects.toThrow('expenses error')
  })

  it('should_throw_when_the_expense_horse_junction_query_rejects', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-03', expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ expenses: [expense], expenseHorses: null, expenseHorsesError: new Error('junction error') }),
    } as any)

    await expect(getScheduleForRange('barn-1', from, to, timezone)).rejects.toThrow('junction error')
  })

  it('should_treat_null_lessons_data_as_empty', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ lessons: null }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result).toEqual([])
  })

  it('should_treat_null_expenses_data_as_empty', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ expenses: null }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result).toEqual([])
  })

  it('should_treat_null_expense_horse_junction_data_as_empty', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-03', expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ expenses: [expense], expenseHorses: null }),
    } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].horseIds).toEqual([])
  })

  it('should_return_lessons_with_empty_expenses_when_horse_expenses_select_returns_no_rows', async () => {
    // manager_all_horse_expenses is manager-only RLS — a trainer/rider caller's session
    // silently gets zero rows back from horse_expenses rather than an error.
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ lessons: [lesson], expenses: [] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result.map((r) => r.itemType)).toEqual(['lesson'])
  })

  it('should_return_event_items_only_when_only_events_exist_in_range', async () => {
    const event = createMockBarnEvent({ id: 'event-1', event_at: '2026-07-03T10:00:00Z' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ events: [event] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result.map((r) => r.itemType)).toEqual(['event'])
  })

  it('should_return_merged_lesson_expense_and_event_items_for_a_mixed_range', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-03', expense_time: '10:00:00' })
    const event = createMockBarnEvent({ id: 'event-1', event_at: '2026-07-04T10:00:00Z' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ lessons: [lesson], expenses: [expense], events: [event] }),
    } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result.map((r) => r.id).sort()).toEqual(['event-1', 'expense-1', 'lesson-1'])
  })

  it('should_set_empty_horse_ids_and_null_instructor_id_on_an_event_item', async () => {
    const event = createMockBarnEvent({ id: 'event-1', event_at: '2026-07-03T10:00:00Z' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ events: [event] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].horseIds).toEqual([])
    expect(result[0].instructorId).toBeNull()
  })

  it('should_throw_when_the_events_query_rejects', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ events: null, eventsError: new Error('events error') }) } as any)

    await expect(getScheduleForRange('barn-1', from, to, timezone)).rejects.toThrow('events error')
  })

  it('should_treat_null_events_data_as_empty', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ events: null }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result).toEqual([])
  })

  it('should_order_a_lesson_before_an_expense_on_the_same_barn_local_day_despite_differing_utc_calendar_dates', async () => {
    // Lesson at 2026-07-04T02:00:00Z = 2026-07-03T22:00:00 local (EDT, UTC-4) — a different
    // UTC calendar day than the expense below despite being the earlier barn-local moment.
    // A naive comparison of the lesson's raw UTC string against the expense's un-zoned wall-clock
    // string would sort '2026-07-03...' (expense) before '2026-07-04...' (lesson) — wrong order.
    const lesson = createMockLesson({ id: 'lesson-1', lesson_at: '2026-07-04T02:00:00.000Z' })
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-03', expense_time: '23:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ lessons: [lesson], expenses: [expense] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result.map((r) => r.id)).toEqual(['lesson-1', 'expense-1'])
  })

  // #1019 — the month conflict picker needs rider ids, per-horse exertion, and a display
  // label that the dashboard views get from their own separately hydrated rows.
  it('should_include_lesson_rider_ids_resolved_from_the_junction_table', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ lessons: [lesson], lessonRiders: [{ lesson_id: 'lesson-1', rider_id: 'mem-9', cancelled_at: null }] }),
    } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].riderIds).toEqual(['mem-9'])
  })

  it('should_exclude_a_cancelled_rider_from_lesson_rider_ids', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({
        lessons: [lesson],
        lessonRiders: [{ lesson_id: 'lesson-1', rider_id: 'mem-9', cancelled_at: '2026-07-02T00:00:00Z' }],
      }),
    } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].riderIds).toEqual([])
  })

  it('should_throw_when_the_lesson_rider_junction_query_rejects', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ lessons: [lesson], lessonRiders: null, lessonRidersError: new Error('rider junction error') }),
    } as any)

    await expect(getScheduleForRange('barn-1', from, to, timezone)).rejects.toThrow('rider junction error')
  })

  it('should_treat_null_lesson_rider_junction_data_as_empty', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ lessons: [lesson], lessonRiders: null }),
    } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].riderIds).toEqual([])
  })

  it('should_not_fetch_lesson_rider_junction_rows_when_no_lesson_rows', async () => {
    const fromFn = makeFrom()
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getScheduleForRange('barn-1', from, to, timezone)

    expect(fromFn).not.toHaveBeenCalledWith('lesson_riders')
  })

  it('should_include_per_horse_exertion_levels_from_the_lesson_horse_junction', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({
      from: makeFrom({ lessons: [lesson], lessonHorses: [{ lesson_id: 'lesson-1', horse_id: 'horse-1', exertion_level: 4 }] }),
    } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].exertionByHorseId).toEqual({ 'horse-1': 4 })
  })

  it('should_set_an_empty_exertion_map_on_an_expense_item', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-03', expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ expenses: [expense] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].exertionByHorseId).toEqual({})
  })

  it('should_set_a_null_label_on_a_lesson_item', async () => {
    const lesson = createMockLesson({ id: 'lesson-1' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ lessons: [lesson] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].label).toBeNull()
  })

  it('should_label_an_expense_item_with_its_type_and_recipient', async () => {
    const expense = createMockHorseExpense({
      id: 'expense-1',
      expense_date: '2026-07-03',
      expense_time: '10:00:00',
      expense_type: 'Veterinary',
      recipient: 'Dr. Smith',
    })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ expenses: [expense] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].label).toBe('Veterinary — Dr. Smith')
  })

  it('should_label_an_event_item_with_its_title', async () => {
    const event = createMockBarnEvent({ id: 'event-1', event_at: '2026-07-03T10:00:00Z', title: 'Costume Party' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ events: [event] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].label).toBe('Costume Party')
  })

  it('should_set_empty_rider_ids_on_an_event_item', async () => {
    const event = createMockBarnEvent({ id: 'event-1', event_at: '2026-07-03T10:00:00Z' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom({ events: [event] }) } as any)

    const result = await getScheduleForRange('barn-1', from, to, timezone)

    expect(result[0].riderIds).toEqual([])
  })
})
