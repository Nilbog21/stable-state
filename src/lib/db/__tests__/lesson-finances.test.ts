import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getFinancialSummary,
  getOutstandingLessons,
  getHorseIncomeSummary,
  getRiderIncomeSummary,
} from '../lesson-finances'

describe('getFinancialSummary', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeSummaryChain(data: { fee: number | null }[], error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockGte, mockLt }
  }

  it('should_return_zero_collected_income_when_no_lessons', async () => {
    const { select } = makeSummaryChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(0)
  })

  it('should_return_empty_breakdown_when_no_lessons', async () => {
    const { select } = makeSummaryChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_return_correct_collected_income_for_single_fee_tier', async () => {
    const { select } = makeSummaryChain([{ fee: 75 }, { fee: 75 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
  })

  it('should_return_breakdown_sorted_ascending_by_fee', async () => {
    const { select } = makeSummaryChain([{ fee: 100 }, { fee: 50 }, { fee: 75 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.map((b) => b.fee)).toEqual([50, 75, 100])
  })

  it('should_exclude_null_fee_lessons_from_collected_income', async () => {
    const { select } = makeSummaryChain([{ fee: 75 }, { fee: null }, { fee: 75 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
  })

  it('should_exclude_null_fee_lessons_from_breakdown', async () => {
    const { select } = makeSummaryChain([{ fee: 75 }, { fee: null }, { fee: 75 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toHaveLength(1)
  })

  it('should_filter_by_barn_id', async () => {
    const { select, mockEq } = makeSummaryChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_start_date', async () => {
    const { select, mockGte } = makeSummaryChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(mockGte).toHaveBeenCalledWith('lesson_at', startDate.toISOString())
  })

  it('should_filter_by_end_date', async () => {
    const { select, mockLt } = makeSummaryChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(mockLt).toHaveBeenCalledWith('lesson_at', endDate.toISOString())
  })

  it('should_calculate_correct_subtotal_per_tier', async () => {
    const { select } = makeSummaryChain([{ fee: 50 }, { fee: 50 }, { fee: 100 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([
      { fee: 50, lessonCount: 2, subtotal: 100 },
      { fee: 100, lessonCount: 1, subtotal: 100 },
    ])
  })

  it('should_return_zero_collected_income_when_data_is_null', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(0)
  })

  it('should_return_empty_breakdown_when_data_is_null', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeSummaryChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  describe('collected and pending income classification', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    function makeSummaryChainFull(data: unknown[], error: Error | null = null) {
      const mockLt = vi.fn().mockResolvedValue({ data, error })
      const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
      const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      return { select: mockSelect }
    }

    it('should_return_collected_income_for_lessons_with_payment_type', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const lesson = createMockLesson({ fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: 'venmo' })
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue(makeSummaryChainFull([lesson])),
      } as any)

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(75)
    })

    it('should_return_zero_pending_income_when_no_future_unpaid_lessons_with_fee', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const lesson = createMockLesson({ fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: 'venmo' })
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue(makeSummaryChainFull([lesson])),
      } as any)

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(0)
    })

    it('should_return_pending_income_for_future_lessons_without_payment_and_with_fee', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const lesson = createMockLesson({ fee: 60, lesson_at: '2026-06-20T10:00:00Z', payment_type: null })
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue(makeSummaryChainFull([lesson])),
      } as any)

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(60)
    })

    it('should_exclude_pending_lesson_with_null_fee_from_pending_income', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const lesson = createMockLesson({ fee: null, lesson_at: '2026-06-20T10:00:00Z', payment_type: null })
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue(makeSummaryChainFull([lesson])),
      } as any)

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(0)
    })

    it('should_return_correct_collected_income_when_lesson_is_paid', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const lesson = createMockLesson({ fee: 50, lesson_at: '2026-06-10T10:00:00Z', payment_type: 'zelle' })
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue(makeSummaryChainFull([lesson])),
      } as any)

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(50)
    })
  })
})

describe('getHorseIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeLessonsChain(data: { id: string; fee: number | null }[], error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  it('should_return_empty_when_no_lessons_in_range', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([])),
    } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_all_lessons_have_null_fee', async () => {
    const lesson = createMockLesson({ fee: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([{ id: lesson.id, fee: null }])),
    } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_lessons_have_no_horses', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_allocate_full_fee_to_single_horse', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }])
  })

  it('should_split_fee_evenly_across_two_horses', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson.id, horse_id: 'horse-1' },
        { lesson_id: lesson.id, horse_id: 'horse-2' },
      ])
      if (table === 'horses') return makeInChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.horseId === 'horse-1')?.totalIncome).toBe(50)
    expect(result.find((r) => r.horseId === 'horse-2')?.totalIncome).toBe(50)
  })

  it('should_split_fee_evenly_across_three_horses', async () => {
    const lesson = createMockLesson({ fee: 90 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 90 }])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson.id, horse_id: 'horse-1' },
        { lesson_id: lesson.id, horse_id: 'horse-2' },
        { lesson_id: lesson.id, horse_id: 'horse-3' },
      ])
      if (table === 'horses') return makeInChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
        { id: 'horse-3', name: 'Blaze' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(3)
    for (const row of result) {
      expect(row.totalIncome).toBe(30)
    }
  })

  it('should_aggregate_across_multiple_lessons_for_same_horse', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 100 })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 50 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson1.id, fee: 100 },
        { id: lesson2.id, fee: 50 },
      ])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson1.id, horse_id: 'horse-1' },
        { lesson_id: lesson2.id, horse_id: 'horse-1' },
      ])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 }])
  })

  it('should_sort_descending_by_total_income', async () => {
    const lesson = createMockLesson({ fee: 90 })
    const lesson2 = createMockLesson({ id: 'lesson-x', fee: 60 })
    const fromFn2 = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson.id, fee: 90 },
        { id: lesson2.id, fee: 60 },
      ])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson.id, horse_id: 'horse-1' },
        { lesson_id: lesson2.id, horse_id: 'horse-1' },
        { lesson_id: lesson2.id, horse_id: 'horse-2' },
      ])
      if (table === 'horses') return makeInChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn2 } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_throw_when_lessons_fetch_returns_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([], new Error('lessons error'))),
    } as any)

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_lesson_horses_fetch_returns_error', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain(null, new Error('lh error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lh error')
  })

  it('should_throw_when_horses_fetch_returns_error', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'horses') return makeInChain(null, new Error('horses error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('horses error')
  })

  it('should_treat_null_lessons_data_as_empty', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_skip_paid_lessons_with_no_horse_entries', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 100 })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 80 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson1.id, fee: 100 },
        { id: lesson2.id, fee: 80 },
      ])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson1.id, horse_id: 'horse-1' },
      ])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }])
  })

  it('should_use_horse_id_as_fallback_when_horse_name_not_found', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-orphan' }])
      if (table === 'horses') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-orphan', horseName: 'horse-orphan', totalIncome: 100 }])
  })

  it('should_treat_null_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'horses') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'horse-1', totalIncome: 100 }])
  })
})

describe('getRiderIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeLessonsChain(data: { id: string; fee: number | null }[], error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  it('should_return_empty_when_no_lessons_in_range', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([])),
    } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_all_fees_are_null', async () => {
    const lesson = createMockLesson({ fee: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([{ id: lesson.id, fee: null }])),
    } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_lesson_has_no_riders', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_full_fee_for_single_rider_lesson', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain([{ id: 'rider-1', name: 'Alice' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'rider-1', riderName: 'Alice', totalIncome: 100 }])
  })

  it('should_split_fee_equally_among_two_riders', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'rider-1' },
        { lesson_id: lesson.id, rider_id: 'rider-2' },
      ])
      if (table === 'riders') return makeInChain([
        { id: 'rider-1', name: 'Alice' },
        { id: 'rider-2', name: 'Bob' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.riderId === 'rider-1')?.totalIncome).toBe(50)
    expect(result.find((r) => r.riderId === 'rider-2')?.totalIncome).toBe(50)
  })

  it('should_split_fee_equally_among_three_riders', async () => {
    const lesson = createMockLesson({ fee: 90 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 90 }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'rider-1' },
        { lesson_id: lesson.id, rider_id: 'rider-2' },
        { lesson_id: lesson.id, rider_id: 'rider-3' },
      ])
      if (table === 'riders') return makeInChain([
        { id: 'rider-1', name: 'Alice' },
        { id: 'rider-2', name: 'Bob' },
        { id: 'rider-3', name: 'Carol' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(3)
    for (const row of result) {
      expect(row.totalIncome).toBe(30)
    }
  })

  it('should_aggregate_income_across_multiple_lessons_for_same_rider', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 100 })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 50 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson1.id, fee: 100 },
        { id: lesson2.id, fee: 50 },
      ])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson1.id, rider_id: 'rider-1' },
        { lesson_id: lesson2.id, rider_id: 'rider-1' },
      ])
      if (table === 'riders') return makeInChain([{ id: 'rider-1', name: 'Alice' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'rider-1', riderName: 'Alice', totalIncome: 150 }])
  })

  it('should_sort_riders_descending_by_income', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 90 })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 60 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson1.id, fee: 90 },
        { id: lesson2.id, fee: 60 },
      ])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson1.id, rider_id: 'rider-1' },
        { lesson_id: lesson2.id, rider_id: 'rider-1' },
        { lesson_id: lesson2.id, rider_id: 'rider-2' },
      ])
      if (table === 'riders') return makeInChain([
        { id: 'rider-1', name: 'Alice' },
        { id: 'rider-2', name: 'Bob' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_throw_on_lessons_query_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([], new Error('lessons error'))),
    } as any)

    await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_lesson_riders_query_error', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain(null, new Error('lr error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lr error')
  })

  it('should_throw_on_riders_query_error', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain(null, new Error('riders error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('riders error')
  })

  it('should_use_rider_id_as_fallback_name_when_rider_not_found', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-orphan' }])
      if (table === 'riders') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'rider-orphan', riderName: 'rider-orphan', totalIncome: 100 }])
  })

  it('should_treat_null_lessons_data_as_empty', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_treat_null_lesson_riders_data_as_empty', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_skip_paid_lessons_with_no_rider_entries', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 100 })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 80 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson1.id, fee: 100 },
        { id: lesson2.id, fee: 80 },
      ])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson1.id, rider_id: 'rider-1' },
      ])
      if (table === 'riders') return makeInChain([{ id: 'rider-1', name: 'Alice' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'rider-1', riderName: 'Alice', totalIncome: 100 }])
  })

  it('should_treat_null_riders_data_as_empty', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'rider-1', riderName: 'rider-1', totalIncome: 100 }])
  })
})

describe('getOutstandingLessons', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeOutstandingChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIs, mockLt, mockOrder }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  it('should_filter_by_barn_id', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select, mockEq } = makeOutstandingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getOutstandingLessons('barn-1')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_null_payment_type', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select, mockIs } = makeOutstandingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getOutstandingLessons('barn-1')

    expect(mockIs).toHaveBeenCalledWith('payment_type', null)
  })

  it('should_filter_lessons_before_now', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select, mockLt } = makeOutstandingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getOutstandingLessons('barn-1')

    expect(mockLt).toHaveBeenCalledWith('lesson_at', new Date('2026-06-15T12:00:00Z').toISOString())
  })

  it('should_sort_outstanding_lessons_by_lesson_at_ascending', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select, mockOrder } = makeOutstandingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getOutstandingLessons('barn-1')

    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
  })

  it('should_return_empty_array_when_no_lessons_match', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select } = makeOutstandingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result).toHaveLength(0)
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select } = makeOutstandingChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result).toHaveLength(0)
  })

  it('should_exclude_zero_fee_lessons', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ fee: 0, lesson_at: '2026-06-10T10:00:00Z', payment_type: null })
    const { select } = makeOutstandingChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result).toHaveLength(0)
  })

  it('should_include_null_fee_lessons', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-null-fee', fee: null, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result).toHaveLength(1)
  })

  it('should_return_null_fee_on_outstanding_lesson', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-null-fee', fee: null, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].fee).toBeNull()
  })

  it('should_return_lesson_id_in_result', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].id).toBe('lesson-1')
  })

  it('should_include_rider_names_in_result', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: 'lesson-1', rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain([{ id: 'rider-1', name: 'Alice' }])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual(['Alice'])
  })

  it('should_include_instructor_name_in_result', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: 'user-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([{ user_id: 'user-1', first_name: 'Jane', last_name: 'Doe' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBe('Jane Doe')
  })

  it('should_return_null_instructor_when_no_profile', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: 'user-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_treat_null_lesson_riders_data_as_empty', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain(null)
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual([])
  })

  it('should_treat_null_profiles_data_as_empty', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: 'user-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_treat_null_riders_data_as_empty', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: 'lesson-1', rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain(null)
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual([])
  })

  it('should_throw_when_lessons_query_fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select } = makeOutstandingChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('db error')
  })

  it('should_throw_when_lesson_riders_query_fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain(null, new Error('lr error'))
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('lr error')
  })

  it('should_throw_when_profiles_query_fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: 'user-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain(null, new Error('prof error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('prof error')
  })

  it('should_throw_when_riders_query_fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: 'lesson-1', rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain(null, new Error('riders error'))
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('riders error')
  })
})
