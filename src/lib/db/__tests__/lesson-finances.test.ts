import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}))
vi.mock('../lesson-finance-queries')
vi.mock('../barn-memberships')
vi.mock('../horses')

import {
  getFinancialSummary,
  getOutstandingLessons,
  getHorseIncomeSummary,
  getRiderIncomeSummary,
  getTrainerIncomeSummary,
  getHorseIncomeDetail,
  getRiderIncomeDetail,
} from '../lesson-finances'
import {
  getLessonsForSummary,
  getTierPricesByNames,
  getOutstandingLessonRows,
  getLessonRidersForLessons,
  getProfileNamesByUserIds,
  getPaidLessonFees,
  getLessonHorsesForLessons,
  getPaidLessonInstructorFees,
  getPaidLessonFeesAt,
  getRiderMembership,
  getProfileNameByUserId,
} from '../lesson-finance-queries'
import { resolveMemberNames } from '../barn-memberships'
import { resolveHorseNames } from '../horses'

describe('getFinancialSummary', () => {
  beforeEach(() => {
    vi.mocked(getLessonsForSummary).mockReset()
    vi.mocked(getTierPricesByNames).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_zero_collected_income_when_no_lessons', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(0)
  })

  it('should_return_empty_breakdown_when_no_lessons', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_return_correct_collected_income_for_single_fee_tier', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 75, payment_type: 'venmo' }),
      createMockLesson({ id: 'lesson-2', fee: 75, payment_type: 'venmo' }),
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
  })

  it('should_return_breakdown_sorted_ascending_by_tier_name', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 100, payment_type: 'venmo', tier_name: 'Standard', lesson_at: '2026-05-10T10:00:00Z' }),
      createMockLesson({ id: 'lesson-2', fee: 50, payment_type: 'cash', tier_name: 'Basic', lesson_at: '2026-05-11T10:00:00Z' }),
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([
      { name: 'Standard', price: 100 },
      { name: 'Basic', price: 50 },
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.map((b) => b.tierName)).toEqual(['Basic', 'Standard'])
  })

  it('should_exclude_null_fee_lessons_from_collected_income', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 75, payment_type: 'venmo' }),
      createMockLesson({ id: 'lesson-2', fee: null, payment_type: 'venmo' }),
      createMockLesson({ id: 'lesson-3', fee: 75, payment_type: 'venmo' }),
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
  })

  it('should_exclude_null_fee_lessons_from_breakdown', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 75, payment_type: 'venmo' }),
      createMockLesson({ id: 'lesson-2', fee: null, payment_type: 'venmo' }),
      createMockLesson({ id: 'lesson-3', fee: 75, payment_type: 'venmo' }),
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toHaveLength(1)
  })

  it('should_call_getLessonsForSummary_with_barn_and_date_range', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([])

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(getLessonsForSummary).toHaveBeenCalledWith(expect.anything(), 'barn-1', startDate, endDate)
  })

  it('should_calculate_correct_subtotal_per_tier', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 50, payment_type: 'venmo', tier_name: 'Basic', lesson_at: '2026-05-10T10:00:00Z' }),
      createMockLesson({ id: 'lesson-2', fee: 50, payment_type: 'cash', tier_name: 'Basic', lesson_at: '2026-05-11T10:00:00Z' }),
      createMockLesson({ id: 'lesson-3', fee: 100, payment_type: 'zelle', tier_name: 'Premium', lesson_at: '2026-05-12T10:00:00Z' }),
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([
      { name: 'Basic', price: 50 },
      { name: 'Premium', price: 100 },
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([
      { tierName: 'Basic', price: 50, lessonCount: 2, subtotal: 100 },
      { tierName: 'Premium', price: 100, lessonCount: 1, subtotal: 100 },
    ])
  })

  it('should_group_breakdown_by_tier_name', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 75, payment_type: 'venmo', tier_name: 'Standard', lesson_at: '2026-05-10T10:00:00Z' }),
      createMockLesson({ id: 'lesson-2', fee: 75, payment_type: 'cash', tier_name: 'Standard', lesson_at: '2026-05-11T10:00:00Z' }),
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Standard', price: 75 }])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toHaveLength(1)
  })

  it('should_return_null_price_for_custom_tier', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 75, payment_type: 'venmo', tier_name: 'Custom', lesson_at: '2026-05-10T10:00:00Z' }),
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBeNull()
  })

  it('should_not_query_tier_prices_when_only_custom_tier_lessons', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 75, payment_type: 'venmo', tier_name: 'Custom', lesson_at: '2026-05-10T10:00:00Z' }),
    ])

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(getTierPricesByNames).not.toHaveBeenCalled()
  })

  it('should_query_tier_prices_with_non_custom_tier_names', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 100, payment_type: 'venmo', tier_name: 'Premium', lesson_at: '2026-05-10T10:00:00Z' }),
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Premium', price: 100 }])

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(getTierPricesByNames).toHaveBeenCalledWith(expect.anything(), 'barn-1', ['Premium'])
  })

  it('should_include_price_from_lesson_tiers_for_named_tier', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 100, payment_type: 'venmo', tier_name: 'Premium', lesson_at: '2026-05-10T10:00:00Z' }),
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Premium', price: 100 }])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBe(100)
  })

  it('should_return_null_price_when_tier_not_found_in_lesson_tiers', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 80, payment_type: 'venmo', tier_name: 'Legacy', lesson_at: '2026-05-10T10:00:00Z' }),
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBeNull()
  })

  it('should_throw_when_lessons_query_fails', async () => {
    vi.mocked(getLessonsForSummary).mockRejectedValue(new Error('db error'))

    await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  it('should_default_to_custom_tier_when_tier_name_is_falsy', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 80, payment_type: 'venmo', tier_name: '', lesson_at: '2026-05-10T10:00:00Z' }),
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].tierName).toBe('Custom')
  })

  it('should_throw_when_lesson_tiers_query_fails', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 100, payment_type: 'venmo', tier_name: 'Premium', lesson_at: '2026-05-10T10:00:00Z' }),
    ])
    vi.mocked(getTierPricesByNames).mockRejectedValue(new Error('tiers error'))

    await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('tiers error')
  })

  describe('collected and pending income classification', () => {
    it('should_return_collected_income_for_lessons_with_payment_type', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: 'venmo' }),
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(75)
    })

    it('should_return_zero_pending_income_when_no_future_unpaid_lessons_with_fee', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 75, lesson_at: '2026-06-10T10:00:00Z', payment_type: 'venmo' }),
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(0)
    })

    it('should_return_pending_income_for_future_lessons_without_payment_and_with_fee', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 60, lesson_at: '2026-06-20T10:00:00Z', payment_type: null }),
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(60)
    })

    it('should_exclude_pending_lesson_with_null_fee_from_pending_income', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: null, lesson_at: '2026-06-20T10:00:00Z', payment_type: null }),
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(0)
    })

    it('should_not_count_past_unpaid_lesson_as_pending_income', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 60, lesson_at: '2026-06-10T10:00:00Z', payment_type: null }),
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(0)
    })
  })
})

describe('getOutstandingLessons', () => {
  beforeEach(() => {
    vi.mocked(getOutstandingLessonRows).mockReset()
    vi.mocked(getLessonRidersForLessons).mockReset()
    vi.mocked(getProfileNamesByUserIds).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
  })

  it('should_return_empty_array_when_no_outstanding_rows', async () => {
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([])

    const result = await getOutstandingLessons('barn-1')

    expect(result).toEqual([])
  })

  it('should_not_fetch_lesson_riders_when_no_outstanding_rows', async () => {
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([])

    await getOutstandingLessons('barn-1')

    expect(getLessonRidersForLessons).not.toHaveBeenCalled()
  })

  it('should_forward_userId_and_role_to_getOutstandingLessonRows', async () => {
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([])

    await getOutstandingLessons('barn-1', 'user-trainer', 'trainer')

    expect(getOutstandingLessonRows).toHaveBeenCalledWith(expect.anything(), 'barn-1', 'user-trainer', 'trainer')
  })

  it('should_return_lesson_id_in_result', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].id).toBe('lesson-1')
  })

  it('should_return_the_lesson_fee_in_result', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].fee).toBe(75)
  })

  it('should_include_rider_names_resolved_from_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual(['Alice Rider'])
  })

  it('should_omit_rider_name_when_not_found_in_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-orphan' }])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual([])
  })

  it('should_include_instructor_name_from_resolved_profiles', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'user-1' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([{ user_id: 'user-1', first_name: 'Jane', last_name: 'Doe' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBe('Jane Doe')
  })

  it('should_return_null_instructor_name_when_no_matching_profile', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'user-1' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_deduplicate_instructor_ids_before_resolving_profiles', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'user-1' })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 50, instructor_id: 'user-1' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson1, lesson2])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getOutstandingLessons('barn-1')

    expect(getProfileNamesByUserIds).toHaveBeenCalledWith(expect.anything(), ['user-1'])
  })

  it('should_resolve_member_names_scoped_to_barn', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getOutstandingLessons('barn-1')

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-1'], 'barn-1', expect.anything())
  })

  it('should_throw_when_getOutstandingLessonRows_rejects', async () => {
    vi.mocked(getOutstandingLessonRows).mockRejectedValue(new Error('outstanding error'))

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('outstanding error')
  })

  it('should_throw_when_getLessonRidersForLessons_rejects', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockRejectedValue(new Error('lr error'))
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('lr error')
  })

  it('should_throw_when_getProfileNamesByUserIds_rejects', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'user-1' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(getProfileNamesByUserIds).mockRejectedValue(new Error('profiles error'))

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('profiles error')
  })
})

describe('getHorseIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonFees).mockReset()
    vi.mocked(getLessonHorsesForLessons).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_when_no_lessons_in_range', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([])

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_all_lessons_have_null_fee', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: null }])

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_not_fetch_lesson_horses_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([])

    await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(getLessonHorsesForLessons).not.toHaveBeenCalled()
  })

  it('should_return_empty_when_lessons_have_no_horses', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([])

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_allocate_full_fee_to_single_horse', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }])
  })

  it('should_allocate_half_fee_to_each_of_two_horses', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-1', horse_id: 'horse-2' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result.every((r) => r.totalIncome === 50)).toBe(true)
  })

  it('should_allocate_equal_share_to_each_horse_when_splitting_across_three', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 90 }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-1', horse_id: 'horse-2' },
      { lesson_id: 'lesson-1', horse_id: 'horse-3' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(
      new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow'], ['horse-3', 'Blaze']])
    )

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result.every((r) => r.totalIncome === 30)).toBe(true)
  })

  it('should_aggregate_across_multiple_lessons_for_same_horse', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-1', fee: 100 },
      { id: 'lesson-2', fee: 50 },
    ])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-1' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 }])
  })

  it('should_sort_descending_by_total_income', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-1', fee: 90 },
      { id: 'lesson-2', fee: 60 },
    ])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-2' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_skip_paid_lessons_with_no_horse_entries', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-1', fee: 100 },
      { id: 'lesson-2', fee: 80 },
    ])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }])
  })

  it('should_use_horse_id_as_fallback_when_horse_name_not_found', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-orphan' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-orphan', horseName: 'horse-orphan', totalIncome: 100 }])
  })

  it('should_scope_resolveHorseNames_to_barn', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(resolveHorseNames).toHaveBeenCalledWith(['horse-1'], 'barn-1', expect.anything())
  })

  it('should_throw_when_getPaidLessonFees_rejects', async () => {
    vi.mocked(getPaidLessonFees).mockRejectedValue(new Error('lessons error'))

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_getLessonHorsesForLessons_rejects', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonHorsesForLessons).mockRejectedValue(new Error('lh error'))

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lh error')
  })
})

describe('getRiderIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonFees).mockReset()
    vi.mocked(getLessonRidersForLessons).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_when_no_lessons_in_range', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([])

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_not_fetch_lesson_riders_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([])

    await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(getLessonRidersForLessons).not.toHaveBeenCalled()
  })

  it('should_return_empty_when_lesson_has_no_riders', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_full_fee_for_single_rider_lesson', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 100 }])
  })

  it('should_allocate_half_fee_to_each_of_two_riders', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-1', rider_id: 'mem-2' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result.every((r) => r.totalIncome === 50)).toBe(true)
  })

  it('should_allocate_equal_share_to_each_rider_when_splitting_across_three', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 90 }])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-1', rider_id: 'mem-2' },
      { lesson_id: 'lesson-1', rider_id: 'mem-3' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result.every((r) => r.totalIncome === 30)).toBe(true)
  })

  it('should_aggregate_income_across_multiple_lessons_for_same_rider', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-1', fee: 100 },
      { id: 'lesson-2', fee: 50 },
    ])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-1' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 150 }])
  })

  it('should_sort_riders_descending_by_income', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-1', fee: 90 },
      { id: 'lesson-2', fee: 60 },
    ])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-2' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_skip_paid_lessons_with_no_rider_entries', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-1', fee: 100 },
      { id: 'lesson-2', fee: 80 },
    ])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 100 }])
  })

  it('should_use_membership_id_as_fallback_name_when_membership_not_found', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-orphan' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-orphan', riderName: 'mem-orphan', totalIncome: 100 }])
  })

  it('should_scope_resolveMemberNames_to_barn', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-1'], 'barn-1', expect.anything())
  })

  it('should_throw_on_lessons_query_error', async () => {
    vi.mocked(getPaidLessonFees).mockRejectedValue(new Error('lessons error'))

    await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_lesson_riders_query_error', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonRidersForLessons).mockRejectedValue(new Error('lr error'))

    await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lr error')
  })
})

describe('getTrainerIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonInstructorFees).mockReset()
    vi.mocked(getProfileNamesByUserIds).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_when_no_collected_lessons', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_all_lessons_have_null_instructor', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: null, fee: 100 }])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_all_lessons_have_null_fee', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'user-1', fee: null }])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_not_fetch_profiles_when_no_collected_lessons', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([])

    await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(getProfileNamesByUserIds).not.toHaveBeenCalled()
  })

  it('should_return_full_fee_for_single_trainer', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'user-1', fee: 100 }])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([{ user_id: 'user-1', first_name: 'Jane', last_name: 'Smith' }])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: 'user-1', trainerName: 'Jane Smith', totalIncome: 100 }])
  })

  it('should_aggregate_income_across_multiple_lessons_for_same_trainer', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
      { instructor_id: 'user-1', fee: 100 },
      { instructor_id: 'user-1', fee: 75 },
    ])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([{ user_id: 'user-1', first_name: 'Jane', last_name: 'Smith' }])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: 'user-1', trainerName: 'Jane Smith', totalIncome: 175 }])
  })

  it('should_return_two_entries_for_two_trainers', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
      { instructor_id: 'user-1', fee: 100 },
      { instructor_id: 'user-2', fee: 50 },
    ])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([
      { user_id: 'user-1', first_name: 'Jane', last_name: 'Smith' },
      { user_id: 'user-2', first_name: 'Bob', last_name: 'Jones' },
    ])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(2)
  })

  it('should_sort_descending_by_total_income', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
      { instructor_id: 'user-1', fee: 50 },
      { instructor_id: 'user-2', fee: 100 },
    ])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([
      { user_id: 'user-1', first_name: 'Jane', last_name: 'Smith' },
      { user_id: 'user-2', first_name: 'Bob', last_name: 'Jones' },
    ])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_use_trainer_id_as_fallback_when_profile_not_found', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'user-orphan', fee: 80 }])
    vi.mocked(getProfileNamesByUserIds).mockResolvedValue([])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].trainerName).toBe('user-orphan')
  })

  it('should_throw_on_lessons_query_error', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockRejectedValue(new Error('lessons error'))

    await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_profiles_query_error', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'user-1', fee: 80 }])
    vi.mocked(getProfileNamesByUserIds).mockRejectedValue(new Error('profiles error'))

    await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('profiles error')
  })
})

describe('getHorseIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonFeesAt).mockReset()
    vi.mocked(getLessonHorsesForLessons).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_rows_and_horse_name_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result).toEqual({ horseName: 'Thunderbolt', rows: [], total: 0 })
  })

  it('should_not_fetch_lesson_horses_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(getLessonHorsesForLessons).not.toHaveBeenCalled()
  })

  it('should_return_horse_id_as_fallback_name_when_horse_not_found', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.horseName).toBe('horse-1')
  })

  it('should_return_row_with_full_fee_when_single_horse_in_lesson', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(100)
  })

  it('should_return_horse_count_of_one_when_single_horse_in_lesson', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].horseCount).toBe(1)
  })

  it('should_split_fee_evenly_when_two_horses_in_lesson', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-1', horse_id: 'horse-2' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(50)
  })

  it('should_only_include_lessons_where_horse_participated', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([
      { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
      { id: 'lesson-2', fee: 80, lesson_at: '2026-05-15T10:00:00Z' },
    ])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-2' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_in_row', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].lessonId).toBe('lesson-1')
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([
      { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
      { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
    ])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-1' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_exclude_lessons_with_null_fee', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([
      { id: 'lesson-1', fee: null, lesson_at: '2026-05-10T10:00:00Z' },
      { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
    ])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-1' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_throw_on_lessons_error', async () => {
    vi.mocked(getPaidLessonFeesAt).mockRejectedValue(new Error('lessons error'))
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_horse_name_resolution_error', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockRejectedValue(new Error('horse error'))

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('horse error')
  })

  it('should_throw_on_lesson_horses_error', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(getLessonHorsesForLessons).mockRejectedValue(new Error('lh error'))

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('lh error')
  })
})

describe('getRiderIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonFeesAt).mockReset()
    vi.mocked(getRiderMembership).mockReset()
    vi.mocked(getProfileNameByUserId).mockReset()
    vi.mocked(getLessonRidersForLessons).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_rider_name_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue({ first_name: 'Alice', last_name: 'Rider' })

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('Alice Rider')
  })

  it('should_return_empty_rows_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_return_zero_total_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.total).toBe(0)
  })

  it('should_not_fetch_lesson_riders_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)

    await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(getLessonRidersForLessons).not.toHaveBeenCalled()
  })

  it('should_return_membership_id_as_fallback_name_when_membership_not_found', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockResolvedValue(null)

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('mem-1')
  })

  it('should_not_fetch_profile_when_membership_has_no_user_id', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: null })

    await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(getProfileNameByUserId).not.toHaveBeenCalled()
  })

  it('should_fall_back_to_membership_id_when_profile_not_found_for_user', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('mem-1')
  })

  it('should_return_rider_name_from_separate_profile_lookup_not_resolveMemberNames', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'rider-user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue({ first_name: 'Alice', last_name: 'Rider' })
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Should Not Be Used']]))

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('Alice Rider')
  })

  it('should_return_row_with_full_fee_when_single_rider_in_lesson', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(100)
  })

  it('should_split_fee_evenly_when_two_riders_in_lesson', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-1', rider_id: 'mem-2' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(50)
  })

  it('should_only_include_lessons_where_rider_participated', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([
      { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
      { id: 'lesson-2', fee: 80, lesson_at: '2026-05-15T10:00:00Z' },
    ])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-2' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_in_row', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].lessonId).toBe('lesson-1')
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([
      { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
      { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
    ])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-1' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_exclude_lessons_with_null_fee', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([
      { id: 'lesson-1', fee: null, lesson_at: '2026-05-10T10:00:00Z' },
      { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
    ])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-1' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_throw_on_lessons_error', async () => {
    vi.mocked(getPaidLessonFeesAt).mockRejectedValue(new Error('lessons error'))
    vi.mocked(getRiderMembership).mockResolvedValue(null)

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_membership_query_error', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(getRiderMembership).mockRejectedValue(new Error('membership error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('membership error')
  })

  it('should_throw_on_lesson_riders_error', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'user-1' })
    vi.mocked(getProfileNameByUserId).mockResolvedValue(null)
    vi.mocked(getLessonRidersForLessons).mockRejectedValue(new Error('lr error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('lr error')
  })

  it('should_throw_when_rider_profile_query_fails', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(getRiderMembership).mockResolvedValue({ id: 'mem-1', user_id: 'rider-user-1' })
    vi.mocked(getProfileNameByUserId).mockRejectedValue(new Error('rider profile error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('rider profile error')
  })
})
