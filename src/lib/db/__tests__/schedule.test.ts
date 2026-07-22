import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson, createMockHorseExpense } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getScheduleForRange, mergeScheduleItems, intervalsOverlap, LESSON_DURATION_MINUTES } from '../schedule'

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

  function makeFrom({
    lessons = [],
    lessonHorses = [],
    expenses = [],
    expenseHorses = [],
    lessonsError = null,
    expensesError = null,
    lessonHorsesError = null,
    expenseHorsesError = null,
  }: {
    lessons?: unknown[] | null
    lessonHorses?: unknown[] | null
    expenses?: unknown[] | null
    expenseHorses?: unknown[] | null
    lessonsError?: Error | null
    expensesError?: Error | null
    lessonHorsesError?: Error | null
    expenseHorsesError?: Error | null
  } = {}) {
    return vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain(lessons, lessonsError)
      if (table === 'lesson_horses') return makeLessonHorsesChain(lessonHorses, lessonHorsesError)
      if (table === 'horse_expenses') return makeExpensesChain(expenses, expensesError)
      if (table === 'expense_horses') return makeExpenseHorsesChain(expenseHorses, expenseHorsesError)
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
})
