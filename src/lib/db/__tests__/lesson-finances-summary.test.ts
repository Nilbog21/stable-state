import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}))
vi.mock('../lesson-finance-queries')
vi.mock('../member-names')
vi.mock('../horses')
vi.mock('../agreement-finances')
vi.mock('../lesson-tiers')

import {
  getFinancialSummary,
  NON_LESSON_INCOME_LABEL,
} from '../lesson-finances'
import {
  getLessonFeeRows,
  getTierPricesByNames,
} from '../lesson-finance-queries'
import { getChargesForSummary } from '../agreement-finances'
import { getTiersByBarn } from '../lesson-tiers'

describe('getFinancialSummary', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(getTierPricesByNames).mockReset()
    vi.mocked(getChargesForSummary).mockReset()
    vi.mocked(getChargesForSummary).mockResolvedValue([])
    vi.mocked(getTiersByBarn).mockReset()
    vi.mocked(getTiersByBarn).mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_zero_collected_income_when_no_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(0)
  })

  it('should_return_empty_breakdown_when_no_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_return_correct_collected_income_for_single_fee_tier', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
  })

  it('should_return_breakdown_sorted_ascending_by_tier_name', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Standard' },
      { lessonId: 'lesson-2', fee: 50, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-11T10:00:00Z', tierName: 'Basic' },
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([
      { name: 'Standard', price: 100 },
      { name: 'Basic', price: 50 },
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.map((b) => b.tierName)).toEqual(['Basic', 'Standard'])
  })

  it('should_sum_fees_from_multiple_paid_lessons_into_collected_income', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-3', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.collectedIncome).toBe(150)
  })

  it('should_call_getLessonFeeRows_with_barn_and_date_range', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(getLessonFeeRows).toHaveBeenCalledWith('barn-1', startDate, endDate, expect.anything())
  })

  it('should_calculate_correct_subtotal_per_tier', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 50, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Basic' },
      { lessonId: 'lesson-2', fee: 50, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-11T10:00:00Z', tierName: 'Basic' },
      { lessonId: 'lesson-3', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-12T10:00:00Z', tierName: 'Premium' },
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
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Standard' },
      { lessonId: 'lesson-2', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-11T10:00:00Z', tierName: 'Standard' },
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Standard', price: 75 }])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toHaveLength(1)
  })

  it('should_return_null_price_for_custom_tier', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBeNull()
  })

  it('should_not_query_tier_prices_when_only_custom_tier_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(getTierPricesByNames).not.toHaveBeenCalled()
  })

  it('should_query_tier_prices_with_non_custom_tier_names', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Premium' },
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Premium', price: 100 }])

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(getTierPricesByNames).toHaveBeenCalledWith('barn-1', ['Premium'], expect.anything())
  })

  it('should_include_price_from_lesson_tiers_for_named_tier', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Premium' },
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Premium', price: 100 }])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBe(100)
  })

  it('should_return_null_price_when_tier_not_found_in_lesson_tiers', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 80, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Legacy' },
    ])
    vi.mocked(getTierPricesByNames).mockResolvedValue([])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].price).toBeNull()
  })

  it('should_throw_when_lessons_query_fails', async () => {
    vi.mocked(getLessonFeeRows).mockRejectedValue(new Error('db error'))

    await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  it('should_default_to_custom_tier_when_tier_name_is_falsy', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 80, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: '' },
    ])

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown[0].tierName).toBe('Custom')
  })

  it('should_throw_when_lesson_tiers_query_fails', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Premium' },
    ])
    vi.mocked(getTierPricesByNames).mockRejectedValue(new Error('tiers error'))

    await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('tiers error')
  })

  describe('collected and pending income classification', () => {
    it('should_return_collected_income_for_lessons_with_payment_type', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-06-10T10:00:00Z', tierName: 'Custom' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(75)
    })

    it('should_return_zero_pending_income_when_no_future_unpaid_lessons_with_fee', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-06-10T10:00:00Z', tierName: 'Custom' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(0)
    })

    it('should_return_pending_income_for_future_lessons_without_payment_and_with_fee', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 60, instructorCut: 0, collected: false, instructorId: 'mem-1', occurredAt: '2026-06-20T10:00:00Z', tierName: 'Custom' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(60)
    })

    it('should_not_count_past_unpaid_lesson_as_pending_income', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 60, instructorCut: 0, collected: false, instructorId: 'mem-1', occurredAt: '2026-06-10T10:00:00Z', tierName: 'Custom' },
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
      vi.mocked(getLessonFeeRows).mockResolvedValue([])

      await getFinancialSummary('barn-1', startDate, endDate)

      expect(getChargesForSummary).toHaveBeenCalledWith('barn-1', startDate, endDate, expect.anything())
    })

    it('should_add_collected_charge_fees_to_collected_income', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([
        { period: '2026-05-01', fee: 300, payment_type: 'venmo' },
        { period: '2026-05-01', fee: 200, payment_type: 'cash' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(500)
    })

    it('should_add_unpaid_charge_fees_to_pending_income_when_period_is_the_current_month', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 150, payment_type: null }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(150)
    })

    it('should_exclude_unpaid_charge_fees_from_pending_income_when_period_is_before_the_current_month', async () => {
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 150, payment_type: null }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(0)
    })

    it('should_append_non_lesson_income_row_when_charges_are_collected', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown).toContainEqual({
        tierName: NON_LESSON_INCOME_LABEL, price: null, lessonCount: 1, subtotal: 300, instructorCut: 0,
      })
    })

    it('should_not_append_non_lesson_income_row_when_no_charges_are_collected', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(getChargesForSummary).mockResolvedValue([])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown.some((b) => b.tierName === NON_LESSON_INCOME_LABEL)).toBe(false)
    })

    it('should_count_only_collected_charges_in_non_lesson_income_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
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
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockRejectedValue(new Error('charges error'))

      await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_subtract_cut_from_collected_income_per_lesson', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(50)
    })

    it('should_subtract_cut_once_per_lesson_in_tier_subtotal', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Standard' },
        { lessonId: 'lesson-2', fee: 75, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-11T10:00:00Z', tierName: 'Standard' },
      ])
      vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Standard', price: 75 }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown[0].subtotal).toBe(100)
    })

    it('should_report_total_instructor_cut_per_tier_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Standard' },
        { lessonId: 'lesson-2', fee: 75, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-11T10:00:00Z', tierName: 'Standard' },
      ])
      vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Standard', price: 75 }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown[0].instructorCut).toBe(50)
    })

    it('should_report_sum_of_each_lessons_own_cut_not_rate_times_count', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Standard' },
        { lessonId: 'lesson-2', fee: 75, instructorCut: 10, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-11T10:00:00Z', tierName: 'Standard' },
      ])
      vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Standard', price: 75 }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown[0].instructorCut).toBe(35)
    })

    it('should_set_instructor_cut_to_zero_on_non_lesson_income_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown.find((b) => b.tierName === NON_LESSON_INCOME_LABEL)?.instructorCut).toBe(0)
    })

    it('should_not_apply_cut_to_charge_income', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(300)
    })

    it('should_subtract_cut_from_pending_income', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 60, instructorCut: 25, collected: false, instructorId: 'mem-1', occurredAt: '2026-06-20T10:00:00Z', tierName: 'Custom' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.pendingIncome).toBe(35)
    })

    it('should_allow_negative_subtotal_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 0, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(-25)
    })

    it('should_reconcile_sum_of_tier_subtotals_and_charges_to_collected_income', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
        { lessonId: 'lesson-2', fee: 100, instructorCut: 25, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-11T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      const breakdownTotal = result.breakdown.reduce((sum, b) => sum + b.subtotal, 0)
      expect(breakdownTotal).toBe(result.collectedIncome)
    })
  })

  describe('zero-collected active tiers', () => {
    it('should_include_an_active_tier_with_no_paid_lessons_as_a_zero_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getTiersByBarn).mockResolvedValue([
        { id: 'tier-1', barn_id: 'barn-1', name: 'Premium', price: 100, is_default: false, is_active: true, default_exertion_level: null, default_jumping: null, instructor_cut: 0, created_at: '2026-01-01T00:00:00Z' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown).toContainEqual({ tierName: 'Premium', price: 100, lessonCount: 0, subtotal: 0, instructorCut: 0 })
    })

    it('should_not_duplicate_a_tier_that_already_has_paid_lessons', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Premium' },
      ])
      vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Premium', price: 100 }])
      vi.mocked(getTiersByBarn).mockResolvedValue([
        { id: 'tier-1', barn_id: 'barn-1', name: 'Premium', price: 100, is_default: false, is_active: true, default_exertion_level: null, default_jumping: null, instructor_cut: 0, created_at: '2026-01-01T00:00:00Z' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown.filter((b) => b.tierName === 'Premium')).toHaveLength(1)
    })

    it('should_sort_zero_tier_rows_alphabetically_with_the_rest_of_the_breakdown', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 50, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Zeta' },
      ])
      vi.mocked(getTierPricesByNames).mockResolvedValue([{ name: 'Zeta', price: 50 }])
      vi.mocked(getTiersByBarn).mockResolvedValue([
        { id: 'tier-1', barn_id: 'barn-1', name: 'Alpha', price: 40, is_default: false, is_active: true, default_exertion_level: null, default_jumping: null, instructor_cut: 0, created_at: '2026-01-01T00:00:00Z' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown.map((b) => b.tierName)).toEqual(['Alpha', 'Zeta'])
    })

    it('should_place_the_non_lesson_income_row_after_zero_tier_rows', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])
      vi.mocked(getTiersByBarn).mockResolvedValue([
        { id: 'tier-1', barn_id: 'barn-1', name: 'Premium', price: 100, is_default: false, is_active: true, default_exertion_level: null, default_jumping: null, instructor_cut: 0, created_at: '2026-01-01T00:00:00Z' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.breakdown[result.breakdown.length - 1].tierName).toBe(NON_LESSON_INCOME_LABEL)
    })

    it('should_not_affect_collected_income_when_a_zero_tier_is_added', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-1', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(getTiersByBarn).mockResolvedValue([
        { id: 'tier-1', barn_id: 'barn-1', name: 'Premium', price: 100, is_default: false, is_active: true, default_exertion_level: null, default_jumping: null, instructor_cut: 0, created_at: '2026-01-01T00:00:00Z' },
      ])

      const result = await getFinancialSummary('barn-1', startDate, endDate)

      expect(result.collectedIncome).toBe(75)
    })

    it('should_throw_when_getTiersByBarn_rejects', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getTiersByBarn).mockRejectedValue(new Error('tiers error'))

      await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('tiers error')
    })
  })
})

