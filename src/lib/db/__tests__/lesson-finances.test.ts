import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}))
vi.mock('../lesson-finance-queries')
vi.mock('../barn-memberships')
vi.mock('../horses')
vi.mock('../agreements')

import { createClient } from '@/lib/supabase/server'
import {
  getFinancialSummary,
  getOutstandingLessons,
  getHorseIncomeSummary,
  getRiderIncomeSummary,
  getTrainerIncomeSummary,
  getHorseIncomeDetail,
  getRiderIncomeDetail,
  mergeOutstandingItems,
  NON_LESSON_INCOME_LABEL,
  NO_INSTRUCTOR_LABEL,
  NO_HORSE_LABEL,
  NO_RIDER_LABEL,
  splitNetFee,
} from '../lesson-finances'
import {
  getLessonsForSummary,
  getTierPricesByNames,
  getOutstandingLessonRows,
  getLessonRidersForLessons,
  getPaidLessonFees,
  getLessonHorsesForLessons,
  getPaidLessonInstructorFees,
  getPaidLessonFeesAt,
} from '../lesson-finance-queries'
import { resolveMemberNames } from '../barn-memberships'
import { resolveHorseNames } from '../horses'
import { getChargesForSummary, getPaidCharges } from '../agreements'

describe('splitNetFee', () => {
  it('should_subtract_instructor_cut_from_fee_to_get_net_fee', () => {
    const { netFee } = splitNetFee(100, 25, 1)
    expect(netFee).toBe(75)
  })

  it('should_divide_net_fee_by_participant_count_to_get_split_amount', () => {
    const { splitAmount } = splitNetFee(100, 0, 2)
    expect(splitAmount).toBe(50)
  })

  it('should_net_the_cut_once_before_dividing_across_participants', () => {
    const { splitAmount } = splitNetFee(100, 20, 2)
    expect(splitAmount).toBe(40)
  })

  it('should_allow_a_negative_net_fee_when_cut_exceeds_fee', () => {
    const { netFee } = splitNetFee(10, 25, 1)
    expect(netFee).toBe(-15)
  })
})

describe('getFinancialSummary', () => {
  beforeEach(() => {
    vi.mocked(getLessonsForSummary).mockReset()
    vi.mocked(getTierPricesByNames).mockReset()
    vi.mocked(getChargesForSummary).mockReset()
    vi.mocked(getChargesForSummary).mockResolvedValue([])
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

  it('should_sum_fees_from_multiple_paid_lessons_into_collected_income', async () => {
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ fee: 75, payment_type: 'venmo' }),
      createMockLesson({ id: 'lesson-3', fee: 75, payment_type: 'venmo' }),
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
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
      { tierName: 'Basic', price: 50, lessonCount: 2, subtotal: 100, instructorCut: 0 },
      { tierName: 'Premium', price: 100, lessonCount: 1, subtotal: 100, instructorCut: 0 },
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

  describe('agreement charge folding', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-05-15T12:00:00Z'))
    })

    it('should_call_getChargesForSummary_with_barn_and_date_range', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([])

      await getFinancialSummary('barn-1', startDate, endDate)

      expect(getChargesForSummary).toHaveBeenCalledWith('barn-1', startDate, endDate, expect.anything())
    })

    it('should_add_collected_charge_fees_to_collected_income', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([
        { period: '2026-05-01', fee: 300, payment_type: 'venmo' },
        { period: '2026-05-01', fee: 200, payment_type: 'cash' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(500)
    })

    it('should_add_unpaid_charge_fees_to_pending_income_when_period_is_the_current_month', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 150, payment_type: null }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(150)
    })

    it('should_exclude_unpaid_charge_fees_from_pending_income_when_period_is_before_the_current_month', async () => {
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonsForSummary).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 150, payment_type: null }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(0)
    })

    it('should_append_non_lesson_income_row_when_charges_are_collected', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown).toContainEqual({
        tierName: NON_LESSON_INCOME_LABEL, price: null, lessonCount: 1, subtotal: 300, instructorCut: 0,
      })
    })

    it('should_not_append_non_lesson_income_row_when_no_charges_are_collected', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 75, payment_type: 'venmo' }),
      ])
      vi.mocked(getChargesForSummary).mockResolvedValue([])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown.some((b) => b.tierName === NON_LESSON_INCOME_LABEL)).toBe(false)
    })

    it('should_count_only_collected_charges_in_non_lesson_income_row', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([
        { period: '2026-05-01', fee: 300, payment_type: 'venmo' },
        { period: '2026-05-01', fee: 150, payment_type: null },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown).toContainEqual({
        tierName: NON_LESSON_INCOME_LABEL, price: null, lessonCount: 1, subtotal: 300, instructorCut: 0,
      })
    })

    it('should_throw_when_charges_query_fails', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockRejectedValue(new Error('charges error'))

      await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_subtract_cut_from_collected_income_per_lesson', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 75, payment_type: 'venmo' }),
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate, 25)

      expect(result.collectedIncome).toBe(50)
    })

    it('should_subtract_cut_once_per_lesson_in_tier_subtotal', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 75, payment_type: 'venmo', tier_name: 'Standard', lesson_at: '2026-05-10T10:00:00Z' }),
        createMockLesson({ id: 'lesson-2', fee: 75, payment_type: 'cash', tier_name: 'Standard', lesson_at: '2026-05-11T10:00:00Z' }),
      ])
      vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Standard', price: 75 }])

      const result = await getFinancialSummary('barn-1', startDate, endDate, 25)

      expect(result.breakdown[0].subtotal).toBe(100)
    })

    it('should_report_total_instructor_cut_per_tier_row', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 75, payment_type: 'venmo', tier_name: 'Standard', lesson_at: '2026-05-10T10:00:00Z' }),
        createMockLesson({ id: 'lesson-2', fee: 75, payment_type: 'cash', tier_name: 'Standard', lesson_at: '2026-05-11T10:00:00Z' }),
      ])
      vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Standard', price: 75 }])

      const result = await getFinancialSummary('barn-1', startDate, endDate, 25)

      expect(result.breakdown[0].instructorCut).toBe(50)
    })

    it('should_set_instructor_cut_to_zero_on_non_lesson_income_row', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getFinancialSummary('barn-1', startDate, endDate, 25)

      expect(result.breakdown.find((b) => b.tierName === NON_LESSON_INCOME_LABEL)?.instructorCut).toBe(0)
    })

    it('should_not_apply_cut_to_charge_income', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getFinancialSummary('barn-1', startDate, endDate, 25)

      expect(result.collectedIncome).toBe(300)
    })

    it('should_subtract_cut_from_pending_income', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 60, lesson_at: '2026-06-20T10:00:00Z', payment_type: null }),
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate, 25)

      expect(result.pendingIncome).toBe(35)
    })

    it('should_allow_negative_subtotal_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 0, payment_type: 'venmo' }),
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate, 25)

      expect(result.collectedIncome).toBe(-25)
    })

    it('should_reconcile_sum_of_tier_subtotals_and_charges_to_collected_income', async () => {
      vi.mocked(getLessonsForSummary).mockResolvedValue([
        createMockLesson({ fee: 75, payment_type: 'venmo', tier_name: 'Custom', lesson_at: '2026-05-10T10:00:00Z' }),
        createMockLesson({ id: 'lesson-2', fee: 100, payment_type: 'cash', tier_name: 'Custom', lesson_at: '2026-05-11T10:00:00Z' }),
      ])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getFinancialSummary('barn-1', startDate, endDate, 25)

      const breakdownTotal = result.breakdown.reduce((sum, b) => sum + b.subtotal, 0)
      expect(breakdownTotal).toBe(result.collectedIncome)
    })
  })
})

describe('getOutstandingLessons', () => {
  beforeEach(() => {
    vi.mocked(getOutstandingLessonRows).mockReset()
    vi.mocked(getLessonRidersForLessons).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(createClient).mockClear()
  })

  it('should_use_injected_client_when_provided', async () => {
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([])
    const injectedClient = {} as any

    await getOutstandingLessons('barn-1', undefined, undefined, injectedClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(getOutstandingLessonRows).toHaveBeenCalledWith(injectedClient, 'barn-1', undefined, undefined)
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
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].id).toBe('lesson-1')
  })

  it('should_return_the_lesson_fee_in_result', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].fee).toBe(75)
  })

  it('should_include_rider_names_resolved_from_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual(['Alice Rider'])
  })

  it('should_omit_rider_name_when_not_found_in_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-orphan' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual([])
  })

  it('should_include_instructor_name_resolved_from_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'mem-instructor' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-instructor', 'Jane Doe']]))

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBe('Jane Doe')
  })

  it('should_return_null_instructor_name_when_not_found_in_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'mem-instructor' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_deduplicate_instructor_ids_before_resolving_names', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'mem-instructor' })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 50, instructor_id: 'mem-instructor' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson1, lesson2])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getOutstandingLessons('barn-1')

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-instructor'], 'barn-1', expect.anything())
  })

  it('should_resolve_member_names_scoped_to_barn', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
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

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('lr error')
  })

  it('should_throw_when_resolveMemberNames_rejects', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'mem-instructor' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve error'))

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('resolve error')
  })
})

describe('getHorseIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonFees).mockReset()
    vi.mocked(getLessonHorsesForLessons).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_when_no_lessons_in_range', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([])

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_not_fetch_lesson_horses_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([])

    await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(getLessonHorsesForLessons).not.toHaveBeenCalled()
  })

  it('should_fold_zero_horse_lesson_into_no_horse_row', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([])

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 100 }])
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

  it('should_fold_zero_horse_lesson_fee_into_no_horse_row_alongside_real_horses', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-1', fee: 100 },
      { id: 'lesson-2', fee: 80 },
    ])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 },
      { horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 80 },
    ])
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

  describe('agreement charge folding', () => {
    it('should_include_horse_income_from_a_charge_when_there_are_no_lessons', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 500 }])
    })

    it('should_add_full_charge_fee_without_splitting', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
        { chargeId: 'charge-2', agreementId: 'agreement-2', period: '2026-05-01', fee: 200, kind: 'lease', riderId: 'mem-2', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 700 }])
    })

    it('should_combine_lesson_split_income_and_charge_income_for_same_horse', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 600 }])
    })

    it('should_throw_when_getPaidCharges_rejects', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockRejectedValue(new Error('charges error'))

      await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_subtract_cut_before_splitting_across_two_horses', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
        { lesson_id: 'lesson-1', horse_id: 'horse-1' },
        { lesson_id: 'lesson-1', horse_id: 'horse-2' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result.every((r) => r.totalIncome === 37.5)).toBe(true)
    })

    it('should_apply_cut_once_per_lesson_regardless_of_horse_count', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
        { lesson_id: 'lesson-1', horse_id: 'horse-1' },
        { lesson_id: 'lesson-1', horse_id: 'horse-2' },
        { lesson_id: 'lesson-1', horse_id: 'horse-3' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(
        new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow'], ['horse-3', 'Blaze']])
      )

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result.every((r) => r.totalIncome === 25)).toBe(true)
    })

    it('should_not_apply_cut_to_charge_income', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 500 }])
    })

    it('should_allow_negative_income_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 0 }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: -25 }])
    })

    it('should_subtract_cut_from_no_horse_row_without_splitting', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([])

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 75 }])
    })
  })
})

describe('getRiderIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonFees).mockReset()
    vi.mocked(getLessonRidersForLessons).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
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

  it('should_fold_zero_rider_lesson_into_no_rider_row', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([])

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 100 }])
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

  it('should_fold_zero_rider_lesson_fee_into_no_rider_row_alongside_real_riders', async () => {
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-1', fee: 100 },
      { id: 'lesson-2', fee: 80 },
    ])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([
      { riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 100 },
      { riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 80 },
    ])
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

  describe('agreement charge folding', () => {
    it('should_include_rider_income_from_a_charge_when_there_are_no_lessons', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 500 }])
    })

    it('should_add_full_charge_fee_without_splitting', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
        { chargeId: 'charge-2', agreementId: 'agreement-2', period: '2026-05-01', fee: 200, kind: 'lease', riderId: 'mem-1', horseId: 'horse-2' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 700 }])
    })

    it('should_combine_lesson_split_income_and_charge_income_for_same_rider', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 600 }])
    })

    it('should_throw_when_getPaidCharges_rejects', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockRejectedValue(new Error('charges error'))

      await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_subtract_cut_before_splitting_across_two_riders', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([
        { lesson_id: 'lesson-1', rider_id: 'mem-1' },
        { lesson_id: 'lesson-1', rider_id: 'mem-2' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result.every((r) => r.totalIncome === 37.5)).toBe(true)
    })

    it('should_apply_cut_once_per_lesson_regardless_of_rider_count', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([
        { lesson_id: 'lesson-1', rider_id: 'mem-1' },
        { lesson_id: 'lesson-1', rider_id: 'mem-2' },
        { lesson_id: 'lesson-1', rider_id: 'mem-3' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result.every((r) => r.totalIncome === 25)).toBe(true)
    })

    it('should_not_apply_cut_to_charge_income', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 500 }])
    })

    it('should_allow_negative_income_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 0 }])
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: -25 }])
    })

    it('should_subtract_cut_from_no_rider_row_without_splitting', async () => {
      vi.mocked(getPaidLessonFees).mockResolvedValue([{ id: 'lesson-1', fee: 100 }])
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([])

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 75 }])
    })
  })
})

describe('getTrainerIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonInstructorFees).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getChargesForSummary).mockReset()
    vi.mocked(getChargesForSummary).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_when_no_collected_lessons', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_fold_null_instructor_lessons_into_no_instructor_row', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: null, fee: 100 }])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: NO_INSTRUCTOR_LABEL, trainerName: NO_INSTRUCTOR_LABEL, totalIncome: 100 }])
  })

  it('should_not_resolve_member_names_when_no_collected_lessons', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([])

    await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(resolveMemberNames).not.toHaveBeenCalled()
  })

  it('should_return_full_fee_for_single_trainer', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'mem-trainer-1', fee: 100 }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: 100 }])
  })

  it('should_aggregate_income_across_multiple_lessons_for_same_trainer', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
      { instructor_id: 'mem-trainer-1', fee: 100 },
      { instructor_id: 'mem-trainer-1', fee: 75 },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: 175 }])
  })

  it('should_return_two_entries_for_two_trainers', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
      { instructor_id: 'mem-trainer-1', fee: 100 },
      { instructor_id: 'mem-trainer-2', fee: 50 },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
      ['mem-trainer-1', 'Jane Smith'],
      ['mem-trainer-2', 'Bob Jones'],
    ]))

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(2)
  })

  it('should_sort_descending_by_total_income', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
      { instructor_id: 'mem-trainer-1', fee: 50 },
      { instructor_id: 'mem-trainer-2', fee: 100 },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
      ['mem-trainer-1', 'Jane Smith'],
      ['mem-trainer-2', 'Bob Jones'],
    ]))

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_use_trainer_id_as_fallback_when_not_found_in_membership_map', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'mem-orphan', fee: 80 }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].trainerName).toBe('mem-orphan')
  })

  it('should_throw_on_lessons_query_error', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockRejectedValue(new Error('lessons error'))

    await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_resolveMemberNames_error', async () => {
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'mem-trainer-1', fee: 80 }])
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve error'))

    await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('resolve error')
  })

  describe('no instructor folding', () => {
    it('should_fold_null_instructor_lesson_alongside_a_named_trainer', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
        { instructor_id: 'mem-trainer-1', fee: 100 },
        { instructor_id: null, fee: 60 },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([
        { trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: 100 },
        { trainerId: NO_INSTRUCTOR_LABEL, trainerName: NO_INSTRUCTOR_LABEL, totalIncome: 60 },
      ])
    })

    it('should_subtract_cut_from_no_instructor_row', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: null, fee: 100 }])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ trainerId: NO_INSTRUCTOR_LABEL, trainerName: NO_INSTRUCTOR_LABEL, totalIncome: 75 }])
    })

    it('should_not_append_no_instructor_row_when_all_lessons_have_a_trainer', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'mem-trainer-1', fee: 100 }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result.some((r) => r.trainerId === NO_INSTRUCTOR_LABEL)).toBe(false)
    })
  })

  describe('agreement charge folding', () => {
    it('should_append_non_lesson_income_row_when_charges_are_collected', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([
        { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300 },
      ])
    })

    it('should_not_append_non_lesson_income_row_when_no_charges_are_collected', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'mem-trainer-1', fee: 100 }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))
      vi.mocked(getChargesForSummary).mockResolvedValue([])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result.some((r) => r.trainerId === NON_LESSON_INCOME_LABEL)).toBe(false)
    })

    it('should_only_count_collected_charges_in_non_lesson_income_row', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([
        { period: '2026-05-01', fee: 300, payment_type: 'venmo' },
        { period: '2026-05-01', fee: 150, payment_type: null },
      ])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([
        { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300 },
      ])
    })

    it('should_throw_when_charges_query_fails', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockRejectedValue(new Error('charges error'))

      await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_subtract_cut_per_lesson_for_trainer_income', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
        { instructor_id: 'mem-trainer-1', fee: 100 },
        { instructor_id: 'mem-trainer-1', fee: 75 },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: 125 }])
    })

    it('should_not_apply_cut_to_non_lesson_income_row', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([
        { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300 },
      ])
    })

    it('should_allow_negative_income_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([{ instructor_id: 'mem-trainer-1', fee: 0 }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate, 25)

      expect(result).toEqual([{ trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: -25 }])
    })
  })
})

describe('getHorseIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonFeesAt).mockReset()
    vi.mocked(getLessonHorsesForLessons).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_rows_and_horse_name_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result).toEqual({ horseName: 'Thunderbolt', rows: [], chargeRows: [], total: 0 })
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

  describe('agreement charge folding', () => {
    it('should_include_a_charge_row_for_the_horse', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.chargeRows).toEqual([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 },
      ])
    })

    it('should_exclude_charges_for_other_horses', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-2' },
      ])

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.chargeRows).toEqual([])
    })

    it('should_add_charge_fee_to_total', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.total).toBe(600)
    })

    it('should_throw_when_getPaidCharges_rejects', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockRejectedValue(new Error('charges error'))

      await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_net_cut_from_row_fee_when_single_horse_in_lesson', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate, 25)

      expect(result.rows[0].fee).toBe(75)
    })

    it('should_net_cut_once_before_splitting_across_two_horses', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
        { lesson_id: 'lesson-1', horse_id: 'horse-1' },
        { lesson_id: 'lesson-1', horse_id: 'horse-2' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate, 25)

      expect(result.rows[0].splitAmount).toBe(37.5)
    })

    it('should_not_apply_cut_to_charge_rows_or_total', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate, 25)

      expect(result.total).toBe(500)
    })

    it('should_allow_negative_row_fee_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 0, lesson_at: '2026-05-10T10:00:00Z' }])
      vi.mocked(getLessonHorsesForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate, 25)

      expect(result.total).toBe(-25)
    })
  })
})

describe('getRiderIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(getPaidLessonFeesAt).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getLessonRidersForLessons).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_rider_name_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('Alice Rider')
  })

  it('should_return_empty_rows_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_return_zero_total_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.total).toBe(0)
  })

  it('should_not_fetch_lesson_riders_when_no_paid_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(getLessonRidersForLessons).not.toHaveBeenCalled()
  })

  it('should_fall_back_to_rider_id_when_name_not_resolved', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('mem-1')
  })

  it('should_scope_resolveMemberNames_to_barn_and_rider_id', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-1'], 'barn-1', expect.anything())
  })

  it('should_return_row_with_full_fee_when_single_rider_in_lesson', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(100)
  })

  it('should_split_fee_evenly_when_two_riders_in_lesson', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
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
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-2' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_in_row', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].lessonId).toBe('lesson-1')
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([
      { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' },
      { id: 'lesson-2', fee: 60, lesson_at: '2026-05-15T10:00:00Z' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-1' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_throw_on_lessons_error', async () => {
    vi.mocked(getPaidLessonFeesAt).mockRejectedValue(new Error('lessons error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_resolveMemberNames_rejects', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('resolve error')
  })

  it('should_throw_on_lesson_riders_error', async () => {
    vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonRidersForLessons).mockRejectedValue(new Error('lr error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('lr error')
  })

  describe('agreement charge folding', () => {
    it('should_include_a_charge_row_for_the_rider', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.chargeRows).toEqual([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 },
      ])
    })

    it('should_exclude_charges_for_other_riders', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-2', horseId: 'horse-1' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.chargeRows).toEqual([])
    })

    it('should_add_charge_fee_to_total', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.total).toBe(600)
    })

    it('should_throw_when_getPaidCharges_rejects', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockRejectedValue(new Error('charges error'))

      await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_net_cut_from_row_fee_when_single_rider_in_lesson', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate, 25)

      expect(result.rows[0].fee).toBe(75)
    })

    it('should_net_cut_once_before_splitting_across_two_riders', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([
        { lesson_id: 'lesson-1', rider_id: 'mem-1' },
        { lesson_id: 'lesson-1', rider_id: 'mem-2' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate, 25)

      expect(result.rows[0].splitAmount).toBe(37.5)
    })

    it('should_not_apply_cut_to_charge_rows_or_total', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate, 25)

      expect(result.total).toBe(500)
    })

    it('should_allow_negative_row_fee_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getPaidLessonFeesAt).mockResolvedValue([{ id: 'lesson-1', fee: 0, lesson_at: '2026-05-10T10:00:00Z' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getLessonRidersForLessons).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate, 25)

      expect(result.total).toBe(-25)
    })
  })
})

describe('mergeOutstandingItems', () => {
  it('should_map_a_lesson_row_to_an_outstanding_item', () => {
    const result = mergeOutstandingItems(
      [{ id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: 'Jane Doe', rider_names: ['Alice'], fee: 75 }],
      []
    )

    expect(result).toEqual([
      { id: 'lesson-1', itemType: 'lesson', date: '2026-06-10T10:00:00Z', instructorName: 'Jane Doe', riderNames: ['Alice'], fee: 75 },
    ])
  })

  it('should_map_a_charge_row_to_an_outstanding_item', () => {
    const result = mergeOutstandingItems(
      [],
      [{ id: 'charge-1', period: '2026-06-01', kind: 'board', riderName: 'Alice Rider', fee: 500 }]
    )

    expect(result).toEqual([
      { id: 'charge-1', itemType: 'board', date: '2026-06-01', instructorName: null, riderNames: ['Alice Rider'], fee: 500 },
    ])
  })

  it('should_map_a_lease_charge_row_with_lease_item_type', () => {
    const result = mergeOutstandingItems(
      [],
      [{ id: 'charge-1', period: '2026-06-01', kind: 'lease', riderName: 'Alice Rider', fee: 200 }]
    )

    expect(result[0].itemType).toBe('lease')
  })

  it('should_sort_merged_items_by_date_ascending', () => {
    const result = mergeOutstandingItems(
      [{ id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-06-15T10:00:00Z', instructor_name: null, rider_names: [], fee: 75 }],
      [{ id: 'charge-1', period: '2026-06-01', kind: 'board', riderName: 'Alice Rider', fee: 500 }]
    )

    expect(result.map((r) => r.id)).toEqual(['charge-1', 'lesson-1'])
  })

  it('should_return_empty_array_when_both_inputs_are_empty', () => {
    expect(mergeOutstandingItems([], [])).toEqual([])
  })
})

describe('reconciliation regression', () => {
  beforeEach(() => {
    vi.mocked(getLessonsForSummary).mockReset()
    vi.mocked(getTierPricesByNames).mockReset()
    vi.mocked(getChargesForSummary).mockReset()
    vi.mocked(getChargesForSummary).mockResolvedValue([])
    vi.mocked(getPaidLessonFees).mockReset()
    vi.mocked(getLessonHorsesForLessons).mockReset()
    vi.mocked(getLessonRidersForLessons).mockReset()
    vi.mocked(getPaidLessonInstructorFees).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')
  const instructorCut = 10

  beforeEach(() => {
    // Lesson A: instructor removed (null), 1 horse, 1 rider
    // Lesson B: named trainer, zero horses, 1 rider
    vi.mocked(getLessonsForSummary).mockResolvedValue([
      createMockLesson({ id: 'lesson-a', fee: 100, payment_type: 'venmo', instructor_id: null }),
      createMockLesson({ id: 'lesson-b', fee: 50, payment_type: 'cash', instructor_id: 'mem-trainer-1' }),
    ])
    vi.mocked(getPaidLessonFees).mockResolvedValue([
      { id: 'lesson-a', fee: 100 },
      { id: 'lesson-b', fee: 50 },
    ])
    vi.mocked(getLessonHorsesForLessons).mockResolvedValue([
      { lesson_id: 'lesson-a', horse_id: 'horse-1' },
    ])
    vi.mocked(getLessonRidersForLessons).mockResolvedValue([
      { lesson_id: 'lesson-a', rider_id: 'mem-1' },
      { lesson_id: 'lesson-b', rider_id: 'mem-2' },
    ])
    vi.mocked(getPaidLessonInstructorFees).mockResolvedValue([
      { instructor_id: null, fee: 100 },
      { instructor_id: 'mem-trainer-1', fee: 50 },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
      ['mem-1', 'Alice Rider'],
      ['mem-2', 'Bob Rider'],
      ['mem-trainer-1', 'Jane Smith'],
    ]))
  })

  it('should_reconcile_by_horse_breakdown_with_collected_income', async () => {
    const { collectedIncome } = await getFinancialSummary('barn-1', startDate, endDate, instructorCut)
    const horseIncome = await getHorseIncomeSummary('barn-1', startDate, endDate, instructorCut)

    const horseTotal = horseIncome.reduce((sum, r) => sum + r.totalIncome, 0)

    expect(horseTotal).toBe(collectedIncome)
  })

  it('should_reconcile_by_rider_breakdown_with_collected_income', async () => {
    const { collectedIncome } = await getFinancialSummary('barn-1', startDate, endDate, instructorCut)
    const riderIncome = await getRiderIncomeSummary('barn-1', startDate, endDate, instructorCut)

    const riderTotal = riderIncome.reduce((sum, r) => sum + r.totalIncome, 0)

    expect(riderTotal).toBe(collectedIncome)
  })

  it('should_reconcile_by_trainer_breakdown_with_collected_income', async () => {
    const { collectedIncome } = await getFinancialSummary('barn-1', startDate, endDate, instructorCut)
    const trainerIncome = await getTrainerIncomeSummary('barn-1', startDate, endDate, instructorCut)

    const trainerTotal = trainerIncome.reduce((sum, r) => sum + r.totalIncome, 0)

    expect(trainerTotal).toBe(collectedIncome)
  })
})
