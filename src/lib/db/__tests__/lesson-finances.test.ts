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
  getTrainerIncomeSummary,
  getHorseIncomeDetail,
  getRiderIncomeDetail,
} from '../lesson-finances'

describe('getFinancialSummary', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeSummaryChain(data: { fee: number | null; [key: string]: unknown }[], error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockGte, mockLt }
  }

  function makeFullLessonsChain(data: unknown[], error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeTiersChain(data: { name: string; price: number | null }[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
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
    const { select } = makeSummaryChain([{ fee: 75, payment_type: 'venmo' }, { fee: 75, payment_type: 'venmo' }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
  })

  it('should_return_breakdown_sorted_ascending_by_tier_name', async () => {
    const lesson1 = createMockLesson({ fee: 100, payment_type: 'venmo', tier_name: 'Standard', lesson_at: '2026-05-10T10:00:00Z' })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 50, payment_type: 'cash', tier_name: 'Basic', lesson_at: '2026-05-11T10:00:00Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeFullLessonsChain([lesson1, lesson2])
      return makeTiersChain([{ name: 'Standard', price: 100 }, { name: 'Basic', price: 50 }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.map((b) => b.tierName)).toEqual(['Basic', 'Standard'])
  })

  it('should_exclude_null_fee_lessons_from_collected_income', async () => {
    const { select } = makeSummaryChain([{ fee: 75, payment_type: 'venmo' }, { fee: null, payment_type: 'venmo' }, { fee: 75, payment_type: 'venmo' }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
  })

  it('should_exclude_null_fee_lessons_from_breakdown', async () => {
    const { select } = makeSummaryChain([{ fee: 75, payment_type: 'venmo' }, { fee: null, payment_type: 'venmo' }, { fee: 75, payment_type: 'venmo' }])
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
    const lesson1 = createMockLesson({ fee: 50, payment_type: 'venmo', tier_name: 'Basic', lesson_at: '2026-05-10T10:00:00Z' })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 50, payment_type: 'cash', tier_name: 'Basic', lesson_at: '2026-05-11T10:00:00Z' })
    const lesson3 = createMockLesson({ id: 'lesson-3', fee: 100, payment_type: 'zelle', tier_name: 'Premium', lesson_at: '2026-05-12T10:00:00Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeFullLessonsChain([lesson1, lesson2, lesson3])
      return makeTiersChain([{ name: 'Basic', price: 50 }, { name: 'Premium', price: 100 }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([
      { tierName: 'Basic', price: 50, lessonCount: 2, subtotal: 100 },
      { tierName: 'Premium', price: 100, lessonCount: 1, subtotal: 100 },
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

  it('should_group_breakdown_by_tier_name', async () => {
    const lesson1 = createMockLesson({ fee: 75, payment_type: 'venmo', tier_name: 'Standard', lesson_at: '2026-05-10T10:00:00Z' })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 75, payment_type: 'cash', tier_name: 'Standard', lesson_at: '2026-05-11T10:00:00Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeFullLessonsChain([lesson1, lesson2])
      return makeTiersChain([{ name: 'Standard', price: 75 }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toHaveLength(1)
  })

  it('should_return_null_price_for_custom_tier', async () => {
    const lesson = createMockLesson({ fee: 75, payment_type: 'venmo', tier_name: 'Custom', lesson_at: '2026-05-10T10:00:00Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeFullLessonsChain([lesson])
      return makeTiersChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBeNull()
  })

  it('should_include_price_from_lesson_tiers_for_named_tier', async () => {
    const lesson = createMockLesson({ fee: 100, payment_type: 'venmo', tier_name: 'Premium', lesson_at: '2026-05-10T10:00:00Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeFullLessonsChain([lesson])
      return makeTiersChain([{ name: 'Premium', price: 100 }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBe(100)
  })

  it('should_return_null_price_when_tier_not_found_in_lesson_tiers', async () => {
    const lesson = createMockLesson({ fee: 80, payment_type: 'venmo', tier_name: 'Legacy', lesson_at: '2026-05-10T10:00:00Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeFullLessonsChain([lesson])
      return makeTiersChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBeNull()
  })

  it('should_treat_null_lesson_tiers_data_as_empty', async () => {
    const lesson = createMockLesson({ fee: 80, payment_type: 'venmo', tier_name: 'Legacy', lesson_at: '2026-05-10T10:00:00Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeFullLessonsChain([lesson])
      return makeTiersChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBeNull()
  })

  it('should_throw_when_lesson_tiers_query_fails', async () => {
    const lesson = createMockLesson({ fee: 100, payment_type: 'venmo', tier_name: 'Premium', lesson_at: '2026-05-10T10:00:00Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeFullLessonsChain([lesson])
      return makeTiersChain(null, new Error('tiers error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('tiers error')
  })

  describe('collected and pending income classification', () => {

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
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
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

  it('should_return_two_entries_when_splitting_fee_across_two_horses', async () => {
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
  })

  it('should_allocate_half_fee_to_horse_1_when_two_horses', async () => {
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

    expect(result.find((r) => r.horseId === 'horse-1')?.totalIncome).toBe(50)
  })

  it('should_allocate_half_fee_to_horse_2_when_two_horses', async () => {
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

    expect(result.find((r) => r.horseId === 'horse-2')?.totalIncome).toBe(50)
  })

  it('should_return_three_entries_when_splitting_fee_across_three_horses', async () => {
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
  })

  it('should_allocate_equal_share_to_each_horse_when_splitting_across_three', async () => {
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

    expect(result.every((r) => r.totalIncome === 30)).toBe(true)
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
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
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

  it('should_exclude_unpaid_lessons_from_income', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([])),
    } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
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
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, in: mockIn })
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
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 100 }])
  })

  it('should_return_two_entries_when_splitting_fee_across_two_riders', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'mem-1' },
        { lesson_id: lesson.id, rider_id: 'mem-2' },
      ])
      if (table === 'barn_memberships') return makeInChain([
        { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
        { id: 'mem-2', user_id: 'user-2', profiles: { first_name: 'Bob', last_name: 'Rider' } },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(2)
  })

  it('should_allocate_half_fee_to_rider_1_when_two_riders', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'mem-1' },
        { lesson_id: lesson.id, rider_id: 'mem-2' },
      ])
      if (table === 'barn_memberships') return makeInChain([
        { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
        { id: 'mem-2', user_id: 'user-2', profiles: { first_name: 'Bob', last_name: 'Rider' } },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result.find((r) => r.riderId === 'mem-1')?.totalIncome).toBe(50)
  })

  it('should_allocate_half_fee_to_rider_2_when_two_riders', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'mem-1' },
        { lesson_id: lesson.id, rider_id: 'mem-2' },
      ])
      if (table === 'barn_memberships') return makeInChain([
        { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
        { id: 'mem-2', user_id: 'user-2', profiles: { first_name: 'Bob', last_name: 'Rider' } },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result.find((r) => r.riderId === 'mem-2')?.totalIncome).toBe(50)
  })

  it('should_return_three_entries_when_splitting_fee_across_three_riders', async () => {
    const lesson = createMockLesson({ fee: 90 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 90 }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'mem-1' },
        { lesson_id: lesson.id, rider_id: 'mem-2' },
        { lesson_id: lesson.id, rider_id: 'mem-3' },
      ])
      if (table === 'barn_memberships') return makeInChain([
        { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
        { id: 'mem-2', user_id: 'user-2', profiles: { first_name: 'Bob', last_name: 'Rider' } },
        { id: 'mem-3', user_id: 'user-3', profiles: { first_name: 'Carol', last_name: 'Rider' } },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(3)
  })

  it('should_allocate_equal_share_to_each_rider_when_splitting_across_three', async () => {
    const lesson = createMockLesson({ fee: 90 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 90 }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'mem-1' },
        { lesson_id: lesson.id, rider_id: 'mem-2' },
        { lesson_id: lesson.id, rider_id: 'mem-3' },
      ])
      if (table === 'barn_memberships') return makeInChain([
        { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
        { id: 'mem-2', user_id: 'user-2', profiles: { first_name: 'Bob', last_name: 'Rider' } },
        { id: 'mem-3', user_id: 'user-3', profiles: { first_name: 'Carol', last_name: 'Rider' } },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result.every((r) => r.totalIncome === 30)).toBe(true)
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
        { lesson_id: lesson1.id, rider_id: 'mem-1' },
        { lesson_id: lesson2.id, rider_id: 'mem-1' },
      ])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 150 }])
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
        { lesson_id: lesson1.id, rider_id: 'mem-1' },
        { lesson_id: lesson2.id, rider_id: 'mem-1' },
        { lesson_id: lesson2.id, rider_id: 'mem-2' },
      ])
      if (table === 'barn_memberships') return makeInChain([
        { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
        { id: 'mem-2', user_id: 'user-2', profiles: { first_name: 'Bob', last_name: 'Rider' } },
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

  it('should_throw_on_barn_memberships_query_error', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain(null, new Error('barn_memberships error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('barn_memberships error')
  })

  it('should_use_membership_id_as_fallback_name_when_membership_not_found', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-orphan' }])
      if (table === 'barn_memberships') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-orphan', riderName: 'mem-orphan', totalIncome: 100 }])
  })

  it('should_use_membership_id_as_fallback_name_when_profiles_is_null', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'user-1', profiles: null }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'mem-1', totalIncome: 100 }])
  })

  it('should_treat_null_lessons_data_as_empty', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
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
        { lesson_id: lesson1.id, rider_id: 'mem-1' },
      ])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 100 }])
  })

  it('should_treat_null_barn_memberships_data_as_empty', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'mem-1', totalIncome: 100 }])
  })

  it('should_exclude_unpaid_lessons_from_income', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([])),
    } as any)

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
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
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, in: mockIn })
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
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } }])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual(['Alice Rider'])
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

  it('should_treat_null_barn_memberships_data_as_empty', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain(null)
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

  it('should_throw_when_barn_memberships_query_fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain(null, new Error('barn_memberships error'))
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('barn_memberships error')
  })

  function makeTrainerOutstandingChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEqInstructor = vi.fn().mockReturnValue({ order: mockOrder })
    const mockLt = vi.fn().mockReturnValue({ eq: mockEqInstructor })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEqBarn = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    return { select: mockSelect, mockEqInstructor, mockOrder }
  }

  function makeMembershipLookupChain(data: { id: string } | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockRoleEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEqUser = vi.fn().mockReturnValue({ eq: mockRoleEq })
    const mockEqBarn = vi.fn().mockReturnValue({ eq: mockEqUser })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    return { select: mockSelect, mockEqBarn, mockEqUser }
  }

  function makeRiderLessonsChain(data: { lesson_id: string }[] | null, error: Error | null = null) {
    const mockEqRider = vi.fn().mockResolvedValue({ data, error })
    const mockEqBarn = vi.fn().mockReturnValue({ eq: mockEqRider })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    return { select: mockSelect, mockEqBarn, mockEqRider }
  }

  function makeRiderOutstandingChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEqBarn = vi.fn().mockReturnValue({ is: mockIs })
    const mockIn = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect, mockIn, mockEqBarn }
  }

  it('should_filter_by_instructor_id_when_role_is_trainer', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select, mockEqInstructor } = makeTrainerOutstandingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getOutstandingLessons('barn-1', 'user-trainer', 'trainer')

    expect(mockEqInstructor).toHaveBeenCalledWith('instructor_id', 'user-trainer')
  })

  it('should_resolve_for_manager_role_without_instructor_filter', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select } = makeOutstandingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getOutstandingLessons('barn-1', 'user-mgr', 'manager')

    expect(result).toEqual([])
  })

  it('should_filter_riders_by_barn_id_when_role_is_rider', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select, mockEqBarn } = makeMembershipLookupChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_lesson_riders_by_barn_id_when_role_is_rider', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select, mockEqBarn } = makeRiderLessonsChain([])
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return { select }
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_outstanding_lessons_by_barn_id_in_rider_path', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select: outstandingSelect, mockEqBarn } = makeRiderOutstandingChain([])
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return makeRiderLessonsChain([{ lesson_id: 'lesson-1' }])
      if (table === 'lessons') return { select: outstandingSelect }
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_riders_by_user_id_when_role_is_rider', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select, mockEqUser } = makeMembershipLookupChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(mockEqUser).toHaveBeenCalledWith('user_id', 'user-rider')
  })

  it('should_return_empty_when_no_rider_record_found', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select } = makeMembershipLookupChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(result).toHaveLength(0)
  })

  it('should_return_empty_when_rider_has_no_lesson_riders', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return makeRiderLessonsChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(result).toHaveLength(0)
  })

  it('should_query_lessons_by_lesson_ids_from_lesson_riders', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select: outstandingSelect, mockIn } = makeRiderOutstandingChain([])
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return makeRiderLessonsChain([{ lesson_id: 'lesson-1' }])
      if (table === 'lessons') return { select: outstandingSelect }
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(mockIn).toHaveBeenCalledWith('id', ['lesson-1'])
  })

  it('should_throw_when_rider_lookup_fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select } = makeMembershipLookupChain(null, new Error('membership lookup error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getOutstandingLessons('barn-1', 'user-rider', 'rider')).rejects.toThrow('membership lookup error')
  })

  it('should_throw_when_rider_lesson_riders_lookup_fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return makeRiderLessonsChain(null, new Error('lesson_riders error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getOutstandingLessons('barn-1', 'user-rider', 'rider')).rejects.toThrow('lesson_riders error')
  })

  it('should_throw_when_outstanding_lessons_query_fails_for_rider', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select: errorSelect } = makeRiderOutstandingChain(null, new Error('lessons query error'))
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return makeRiderLessonsChain([{ lesson_id: 'lesson-1' }])
      if (table === 'lessons') return { select: errorSelect }
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getOutstandingLessons('barn-1', 'user-rider', 'rider')).rejects.toThrow('lessons query error')
  })

  it('should_treat_null_lesson_riders_data_as_empty_for_rider_path', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return makeRiderLessonsChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(result).toHaveLength(0)
  })

  it('should_return_outstanding_lessons_for_rider', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const { select: outstandingSelect } = makeRiderOutstandingChain([lesson])
    let barnMembershipsCallCount = 0
    let lessonRidersCallCount = 0
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') {
        barnMembershipsCallCount++
        return barnMembershipsCallCount === 1 ? makeMembershipLookupChain({ id: 'mem-1' }) : makeInChain([])
      }
      if (table === 'lesson_riders') {
        lessonRidersCallCount++
        return lessonRidersCallCount === 1
          ? makeRiderLessonsChain([{ lesson_id: 'lesson-1' }])
          : makeInChain([])
      }
      if (table === 'lessons') return { select: outstandingSelect }
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(result).toHaveLength(1)
  })

  it('should_exclude_zero_fee_lessons_in_rider_path', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 0, lesson_at: '2026-06-10T10:00:00Z', payment_type: null })
    const { select: outstandingSelect } = makeRiderOutstandingChain([lesson])
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return makeRiderLessonsChain([{ lesson_id: 'lesson-1' }])
      if (table === 'lessons') return { select: outstandingSelect }
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(result).toHaveLength(0)
  })

  it('should_treat_null_lessons_data_as_empty_in_rider_path', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const { select: outstandingSelect } = makeRiderOutstandingChain(null)
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'mem-1' })
      if (table === 'lesson_riders') return makeRiderLessonsChain([{ lesson_id: 'lesson-1' }])
      if (table === 'lessons') return { select: outstandingSelect }
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1', 'user-rider', 'rider')

    expect(result).toHaveLength(0)
  })

  it('should_use_membership_id_as_rider_name_when_profiles_is_null', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: null, instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeOutstandingChain([lesson])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'user-1', profiles: null }])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual(['mem-1'])
  })
})

describe('getTrainerIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeCollectedLessonsChain(data: { instructor_id: string | null; fee: number | null }[], error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeProfilesChain(data: { user_id: string; first_name: string; last_name: string }[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  it('should_return_empty_when_no_collected_lessons', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeCollectedLessonsChain([])),
    } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_all_lessons_have_null_instructor', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([{ instructor_id: null, fee: 100 }])
      return makeProfilesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_all_lessons_have_null_fee', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([{ instructor_id: 'user-1', fee: null }])
      return makeProfilesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_full_fee_for_single_trainer', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([{ instructor_id: 'user-1', fee: 100 }])
      return makeProfilesChain([{ user_id: 'user-1', first_name: 'Jane', last_name: 'Smith' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: 'user-1', trainerName: 'Jane Smith', totalIncome: 100 }])
  })

  it('should_aggregate_income_across_multiple_lessons_for_same_trainer', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([
        { instructor_id: 'user-1', fee: 100 },
        { instructor_id: 'user-1', fee: 75 },
      ])
      return makeProfilesChain([{ user_id: 'user-1', first_name: 'Jane', last_name: 'Smith' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: 'user-1', trainerName: 'Jane Smith', totalIncome: 175 }])
  })

  it('should_return_two_entries_for_two_trainers', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([
        { instructor_id: 'user-1', fee: 100 },
        { instructor_id: 'user-2', fee: 50 },
      ])
      return makeProfilesChain([
        { user_id: 'user-1', first_name: 'Jane', last_name: 'Smith' },
        { user_id: 'user-2', first_name: 'Bob', last_name: 'Jones' },
      ])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(2)
  })

  it('should_sort_descending_by_total_income', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([
        { instructor_id: 'user-1', fee: 50 },
        { instructor_id: 'user-2', fee: 100 },
      ])
      return makeProfilesChain([
        { user_id: 'user-1', first_name: 'Jane', last_name: 'Smith' },
        { user_id: 'user-2', first_name: 'Bob', last_name: 'Jones' },
      ])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_include_trainer_full_name_from_profiles', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([{ instructor_id: 'user-1', fee: 80 }])
      return makeProfilesChain([{ user_id: 'user-1', first_name: 'Alice', last_name: 'Walker' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].trainerName).toBe('Alice Walker')
  })

  it('should_use_trainer_id_as_fallback_when_profile_not_found', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([{ instructor_id: 'user-orphan', fee: 80 }])
      return makeProfilesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].trainerName).toBe('user-orphan')
  })

  it('should_treat_null_lessons_data_as_empty', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_treat_null_profiles_data_as_empty', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([{ instructor_id: 'user-1', fee: 80 }])
      return makeProfilesChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].trainerName).toBe('user-1')
  })

  it('should_throw_on_lessons_query_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeCollectedLessonsChain([], new Error('lessons error'))),
    } as any)

    await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_profiles_query_error', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeCollectedLessonsChain([{ instructor_id: 'user-1', fee: 80 }])
      return makeProfilesChain(null, new Error('profiles error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('profiles error')
  })
})

describe('getHorseIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeLessonsChain(
    data: { id: string; fee: number | null; lesson_at: string }[],
    error: Error | null = null
  ) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeHorseChain(
    data: { id: string; name: string } | null,
    error: Error | null = null
  ) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function setupClient(
    lessons: { id: string; fee: number | null; lesson_at: string }[],
    horse: { id: string; name: string } | null,
    lessonHorses: { lesson_id: string; horse_id: string }[]
  ) {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain(lessons)
        if (table === 'horses') return makeHorseChain(horse)
        if (table === 'lesson_horses') return makeInChain(lessonHorses)
        return makeInChain([])
      }),
    } as any)
  }

  it('should_return_empty_rows_and_horse_name_when_no_paid_lessons', async () => {
    setupClient([], { id: 'horse-1', name: 'Thunderbolt' }, [])

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result).toEqual({ horseName: 'Thunderbolt', rows: [], total: 0 })
  })

  it('should_return_horse_id_as_fallback_name_when_horse_not_found', async () => {
    setupClient([], null, [])

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.horseName).toBe('horse-1')
  })

  it('should_return_row_with_full_fee_when_single_horse_in_lesson', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'horse-1', name: 'Thunderbolt' },
      [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(100)
  })

  it('should_return_horse_count_of_one_when_single_horse_in_lesson', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'horse-1', name: 'Thunderbolt' },
      [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].horseCount).toBe(1)
  })

  it('should_split_fee_evenly_when_two_horses_in_lesson', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'horse-1', name: 'Thunderbolt' },
      [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }, { lesson_id: 'lesson-1', horse_id: 'horse-2' }]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(50)
  })

  it('should_return_horse_count_of_two_when_two_horses_in_lesson', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'horse-1', name: 'Thunderbolt' },
      [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }, { lesson_id: 'lesson-1', horse_id: 'horse-2' }]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].horseCount).toBe(2)
  })

  it('should_return_full_lesson_fee_in_row', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'horse-1', name: 'Thunderbolt' },
      [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }, { lesson_id: 'lesson-1', horse_id: 'horse-2' }]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].fee).toBe(100)
  })

  it('should_only_include_lessons_where_horse_participated', async () => {
    setupClient(
      [
        { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
        { id: 'lesson-2', fee: 80, lesson_at: '2026-05-15T10:00:00Z' },
      ],
      { id: 'horse-1', name: 'Thunderbolt' },
      [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }, { lesson_id: 'lesson-2', horse_id: 'horse-2' }]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_in_row', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'horse-1', name: 'Thunderbolt' },
      [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].lessonId).toBe('lesson-1')
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    setupClient(
      [
        { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
        { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
      ],
      { id: 'horse-1', name: 'Thunderbolt' },
      [
        { lesson_id: 'lesson-1', horse_id: 'horse-1' },
        { lesson_id: 'lesson-2', horse_id: 'horse-1' },
      ]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_exclude_lessons_with_null_fee', async () => {
    setupClient(
      [
        { id: 'lesson-1', fee: null, lesson_at: '2026-05-10T10:00:00Z' },
        { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
      ],
      { id: 'horse-1', name: 'Thunderbolt' },
      [
        { lesson_id: 'lesson-1', horse_id: 'horse-1' },
        { lesson_id: 'lesson-2', horse_id: 'horse-1' },
      ]
    )

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_throw_on_lessons_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([], new Error('lessons error'))
        return makeHorseChain(null)
      }),
    } as any)

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_horse_query_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([])
        if (table === 'horses') return makeHorseChain(null, new Error('horse error'))
        return makeInChain([])
      }),
    } as any)

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('horse error')
  })

  it('should_throw_on_lesson_horses_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
        if (table === 'horses') return makeHorseChain({ id: 'horse-1', name: 'Thunderbolt' })
        if (table === 'lesson_horses') return makeInChain(null, new Error('lh error'))
        return makeInChain([])
      }),
    } as any)

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('lh error')
  })

  it('should_treat_null_lesson_data_as_empty', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain(null as any)
        if (table === 'horses') return makeHorseChain({ id: 'horse-1', name: 'Thunderbolt' })
        return makeInChain([])
      }),
    } as any)

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
        if (table === 'horses') return makeHorseChain({ id: 'horse-1', name: 'Thunderbolt' })
        if (table === 'lesson_horses') return makeInChain(null)
        return makeInChain([])
      }),
    } as any)

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })
})

describe('getRiderIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeLessonsChain(
    data: { id: string; fee: number | null; lesson_at: string }[],
    error: Error | null = null
  ) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeRiderChain(
    data: { id: string; user_id: string | null; profiles: { first_name: string; last_name: string } } | null,
    error: Error | null = null
  ) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function setupClient(
    lessons: { id: string; fee: number | null; lesson_at: string }[],
    rider: { id: string; user_id: string | null; profiles: { first_name: string; last_name: string } } | null,
    lessonRiders: { lesson_id: string; rider_id: string }[]
  ) {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain(lessons)
        if (table === 'barn_memberships') return makeRiderChain(rider)
        if (table === 'lesson_riders') return makeInChain(lessonRiders)
        return makeInChain([])
      }),
    } as any)
  }

  it('should_filter_lesson_riders_by_barn_id', async () => {
    const mockEq = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
        if (table === 'barn_memberships') return makeRiderChain({ id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } })
        if (table === 'lesson_riders') return { select: vi.fn().mockReturnValue({ eq: mockEq }) }
        return makeInChain([])
      }),
    } as any)

    await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_return_rider_name_when_no_paid_lessons', async () => {
    setupClient([], { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } }, [])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('Alice Rider')
  })

  it('should_return_empty_rows_when_no_paid_lessons', async () => {
    setupClient([], { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } }, [])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_return_zero_total_when_no_paid_lessons', async () => {
    setupClient([], { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } }, [])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.total).toBe(0)
  })

  it('should_return_membership_id_as_fallback_name_when_membership_not_found', async () => {
    setupClient([], null, [])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('mem-1')
  })

  it('should_return_row_with_full_fee_when_single_rider_in_lesson', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [{ lesson_id: 'lesson-1', rider_id: 'mem-1' }]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(100)
  })

  it('should_return_rider_count_of_one_when_single_rider_in_lesson', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [{ lesson_id: 'lesson-1', rider_id: 'mem-1' }]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].riderCount).toBe(1)
  })

  it('should_split_fee_evenly_when_two_riders_in_lesson', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [{ lesson_id: 'lesson-1', rider_id: 'mem-1' }, { lesson_id: 'lesson-1', rider_id: 'mem-2' }]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(50)
  })

  it('should_return_rider_count_of_two_when_two_riders_in_lesson', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [{ lesson_id: 'lesson-1', rider_id: 'mem-1' }, { lesson_id: 'lesson-1', rider_id: 'mem-2' }]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].riderCount).toBe(2)
  })

  it('should_return_full_lesson_fee_in_row', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [{ lesson_id: 'lesson-1', rider_id: 'mem-1' }, { lesson_id: 'lesson-1', rider_id: 'mem-2' }]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].fee).toBe(100)
  })

  it('should_only_include_lessons_where_rider_participated', async () => {
    setupClient(
      [
        { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
        { id: 'lesson-2', fee: 80, lesson_at: '2026-05-15T10:00:00Z' },
      ],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [{ lesson_id: 'lesson-1', rider_id: 'mem-1' }, { lesson_id: 'lesson-2', rider_id: 'mem-2' }]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_in_row', async () => {
    setupClient(
      [{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [{ lesson_id: 'lesson-1', rider_id: 'mem-1' }]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].lessonId).toBe('lesson-1')
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    setupClient(
      [
        { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
        { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
      ],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [
        { lesson_id: 'lesson-1', rider_id: 'mem-1' },
        { lesson_id: 'lesson-2', rider_id: 'mem-1' },
      ]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_exclude_lessons_with_null_fee', async () => {
    setupClient(
      [
        { id: 'lesson-1', fee: null, lesson_at: '2026-05-10T10:00:00Z' },
        { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
      ],
      { id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } },
      [
        { lesson_id: 'lesson-1', rider_id: 'mem-1' },
        { lesson_id: 'lesson-2', rider_id: 'mem-1' },
      ]
    )

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_throw_on_lessons_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([], new Error('lessons error'))
        return makeRiderChain(null)
      }),
    } as any)

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_membership_query_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([])
        if (table === 'barn_memberships') return makeRiderChain(null, new Error('membership error'))
        return makeInChain([])
      }),
    } as any)

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('membership error')
  })

  it('should_throw_on_lesson_riders_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
        if (table === 'barn_memberships') return makeRiderChain({ id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } })
        if (table === 'lesson_riders') return makeInChain(null, new Error('lr error'))
        return makeInChain([])
      }),
    } as any)

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('lr error')
  })

  it('should_treat_null_lesson_data_as_empty', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain(null as any)
        if (table === 'barn_memberships') return makeRiderChain({ id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } })
        return makeInChain([])
      }),
    } as any)

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_treat_null_lesson_riders_data_as_empty', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
        if (table === 'barn_memberships') return makeRiderChain({ id: 'mem-1', user_id: 'user-1', profiles: { first_name: 'Alice', last_name: 'Rider' } })
        if (table === 'lesson_riders') return makeInChain(null)
        return makeInChain([])
      }),
    } as any)

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })
})
