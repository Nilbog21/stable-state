import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}))
vi.mock('../lesson-finance-queries')
vi.mock('../member-names')
vi.mock('../horses')
vi.mock('../agreement-finances')
vi.mock('../lesson-tiers')

import {
  getEntityIncome,
  getFinancialSummary,
  getHorseIncomeSummary,
  getRiderIncomeSummary,
  getTrainerIncomeSummary,
  HORSE_INCOME_DESCRIPTOR,
  TRAINER_INCOME_DESCRIPTOR,
  NON_LESSON_INCOME_LABEL,
} from '../lesson-finances'
import {
  getLessonFeeRows,
  getTierPricesByNames,
  getLessonJunctionRows,
} from '../lesson-finance-queries'
import { resolveMemberNames } from '../member-names'
import { resolveHorseNames } from '../horses'
import { getChargesForSummary, getPaidCharges } from '../agreement-finances'
import { getTiersByBarn } from '../lesson-tiers'

describe('getEntityIncome', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(getLessonJunctionRows).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
    vi.mocked(getChargesForSummary).mockReset()
    vi.mocked(getChargesForSummary).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  describe('summary mode', () => {
    it('should_group_by_junction_table_and_fold_charges_for_a_chargesApply_descriptor', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 50, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getEntityIncome(HORSE_INCOME_DESCRIPTOR, 'summary', 'barn-1', startDate, endDate)

      expect(result).toEqual([{ id: 'horse-1', name: 'Thunderbolt', totalIncome: 150, grossIncome: null }])
    })

    it('should_key_by_instructorId_directly_and_append_a_synthetic_row_for_a_non_junction_non_chargesApply_descriptor', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 300, payment_type: 'venmo' }])

      const result = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'summary', 'barn-1', startDate, endDate)

      expect(result).toEqual([{ id: NON_LESSON_INCOME_LABEL, name: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null }])
    })

    it('should_omit_the_synthetic_row_when_paid_charges_sum_to_zero', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: '2026-05-01', fee: 0, payment_type: 'venmo' }])

      const result = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'summary', 'barn-1', startDate, endDate)

      expect(result).toEqual([])
    })

    it('should_populate_grossIncome_from_raw_pre_cut_fee_when_includeGrossIncome_is_set', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'summary', 'barn-1', startDate, endDate)

      expect(result).toEqual([{ id: 'mem-trainer-1', name: 'Jane Smith', totalIncome: 75, grossIncome: 100 }])
    })

    it('should_not_include_grossIncome_when_descriptor_omits_it', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getEntityIncome(HORSE_INCOME_DESCRIPTOR, 'summary', 'barn-1', startDate, endDate)

      expect(result[0].grossIncome).toBeNull()
    })
  })

  describe('detail mode', () => {
    it('should_split_across_junction_participants_and_include_charge_rows_for_a_chargesApply_descriptor', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([
        { lesson_id: 'lesson-1', horse_id: 'horse-1' },
        { lesson_id: 'lesson-1', horse_id: 'horse-2' },
      ])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getEntityIncome(HORSE_INCOME_DESCRIPTOR, 'detail', 'barn-1', startDate, endDate, 'horse-1')

      expect(result).toEqual({
        name: 'Thunderbolt',
        rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, count: 2, splitAmount: 50 }],
        chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 }],
        total: 550,
      })
    })

    it('should_key_by_instructorId_directly_with_no_charge_rows_for_a_non_junction_non_chargesApply_descriptor', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
        { lessonId: 'lesson-2', fee: 80, instructorCut: 0, collected: true, instructorId: 'mem-trainer-2', occurredAt: '2026-05-15T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'detail', 'barn-1', startDate, endDate, 'mem-trainer-1')

      expect(result).toEqual({
        name: 'Jane Smith',
        rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 75, count: 1, splitAmount: 75 }],
        chargeRows: [],
        total: 75,
      })
      expect(getLessonJunctionRows).not.toHaveBeenCalled()
    })

    it('should_exclude_a_null_instructor_lesson_for_a_non_junction_descriptor', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'detail', 'barn-1', startDate, endDate, 'mem-trainer-1')

      expect(result.rows).toEqual([])
    })
  })

  describe('mode dispatch', () => {
    it('should_return_a_summary_array_for_summary_mode', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const summary = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'summary', 'barn-1', startDate, endDate)

      expect(Array.isArray(summary)).toBe(true)
    })

    it('should_return_a_detail_object_for_detail_mode_against_the_same_data', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const detail = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'detail', 'barn-1', startDate, endDate, 'mem-trainer-1')

      expect(Array.isArray(detail)).toBe(false)
    })
  })
})

describe('reconciliation regression', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(getTierPricesByNames).mockReset()
    vi.mocked(getChargesForSummary).mockReset()
    vi.mocked(getChargesForSummary).mockResolvedValue([])
    vi.mocked(getLessonJunctionRows).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
    vi.mocked(getTiersByBarn).mockReset()
    vi.mocked(getTiersByBarn).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')
  const instructorCut = 10

  beforeEach(() => {
    // Lesson A: instructor removed (null), 1 horse, 1 rider
    // Lesson B: named trainer, zero horses, 1 rider
    // getFinancialSummary and the by-horse/by-rider/by-trainer summaries all read the
    // same getLessonFeeRows rows now, so a single shared mock covers every caller below.
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-a', fee: 100, instructorCut, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-b', fee: 50, instructorCut, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-11T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockImplementation(async (table) =>
      table === 'lesson_horses'
        ? [{ lesson_id: 'lesson-a', horse_id: 'horse-1' }]
        : [
            { lesson_id: 'lesson-a', rider_id: 'mem-1' },
            { lesson_id: 'lesson-b', rider_id: 'mem-2' },
          ]
    )
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
      ['mem-1', 'Alice Rider'],
      ['mem-2', 'Bob Rider'],
      ['mem-trainer-1', 'Jane Smith'],
    ]))
  })

  it('should_reconcile_by_horse_gross_breakdown_with_tier_gross_total', async () => {
    // #971: getHorseIncomeSummary's totalIncome is gross (pre-cut) since HORSE_INCOME_DESCRIPTOR
    // sets splitsGrossFee — it no longer reconciles with collectedIncome (net-of-cut), only with
    // the tier breakdown's own gross figure (subtotal + instructorCut summed).
    const { breakdown } = await getFinancialSummary('barn-1', startDate, endDate)
    const tierGrossTotal = breakdown.reduce((sum, b) => sum + b.subtotal + b.instructorCut, 0)
    const horseIncome = await getHorseIncomeSummary('barn-1', startDate, endDate)

    const horseGrossTotal = horseIncome.reduce((sum, r) => sum + r.totalIncome, 0)

    expect(horseGrossTotal).toBe(tierGrossTotal)
  })

  it('should_reconcile_by_rider_gross_breakdown_with_tier_gross_total', async () => {
    const { breakdown } = await getFinancialSummary('barn-1', startDate, endDate)
    const tierGrossTotal = breakdown.reduce((sum, b) => sum + b.subtotal + b.instructorCut, 0)
    const riderIncome = await getRiderIncomeSummary('barn-1', startDate, endDate)

    const riderGrossTotal = riderIncome.reduce((sum, r) => sum + r.totalIncome, 0)

    expect(riderGrossTotal).toBe(tierGrossTotal)
  })

  it('should_reconcile_by_trainer_breakdown_with_collected_income', async () => {
    const { collectedIncome } = await getFinancialSummary('barn-1', startDate, endDate)
    const trainerIncome = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    const trainerTotal = trainerIncome.reduce((sum, r) => sum + r.totalIncome, 0)

    expect(trainerTotal).toBe(collectedIncome)
  })
})

