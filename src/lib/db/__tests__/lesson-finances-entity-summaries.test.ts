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
  getHorseIncomeSummary,
  getRiderIncomeSummary,
  getTrainerIncomeSummary,
  NON_LESSON_INCOME_LABEL,
  NO_INSTRUCTOR_LABEL,
  NO_HORSE_LABEL,
  NO_RIDER_LABEL,
} from '../lesson-finances'
import {
  getLessonFeeRows,
  getLessonJunctionRows,
} from '../lesson-finance-queries'
import { resolveMemberNames } from '../member-names'
import { resolveHorseNames } from '../horses'
import { getChargesForSummary, getPaidCharges } from '../agreement-finances'
import { calendarDate } from '@/lib/local-day'

describe('getHorseIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(getLessonJunctionRows).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_when_no_lessons_in_range', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_not_fetch_lesson_horses_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(getLessonJunctionRows).not.toHaveBeenCalled()
  })

  it('should_fold_zero_horse_lesson_into_no_horse_row', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([])

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 100 }])
  })

  it('should_allocate_full_fee_to_single_horse', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }])
  })

  it('should_allocate_half_fee_to_each_of_two_horses', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-1', horse_id: 'horse-2' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result.every((r) => r.totalIncome === 50)).toBe(true)
  })

  it('should_allocate_equal_share_to_each_horse_when_splitting_across_three', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 90, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
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
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 50, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-1' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 }])
  })

  it('should_sort_descending_by_total_income', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 90, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 60, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-2' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_fold_zero_horse_lesson_fee_into_no_horse_row_alongside_real_horses', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 80, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 },
      { horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 80 },
    ])
  })

  it('should_sort_no_horse_row_last_even_when_its_total_exceeds_a_real_horse', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 200, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 10, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-2', horse_id: 'horse-1' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 10 },
      { horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 200 },
    ])
  })

  it('should_use_horse_id_as_fallback_when_horse_name_not_found', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-orphan' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-orphan', horseName: 'horse-orphan', totalIncome: 100 }])
  })

  it('should_scope_resolveHorseNames_to_barn', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(resolveHorseNames).toHaveBeenCalledWith(['horse-1'], 'barn-1', expect.anything())
  })

  it('should_throw_when_getLessonFeeRows_rejects', async () => {
    vi.mocked(getLessonFeeRows).mockRejectedValue(new Error('lessons error'))

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_getLessonJunctionRows_rejects', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockRejectedValue(new Error('lh error'))

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lh error')
  })

  describe('agreement charge folding', () => {
    it('should_include_horse_income_from_a_charge_when_there_are_no_lessons', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 500 }])
    })

    it('should_add_full_charge_fee_without_splitting', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
        { chargeId: 'charge-2', agreementId: 'agreement-2', period: calendarDate('2026-05-01'), fee: 200, kind: 'lease', riderId: 'mem-2', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 700 }])
    })

    it('should_combine_lesson_split_income_and_charge_income_for_same_horse', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 600 }])
    })

    it('should_fold_a_charge_with_a_null_horseId_into_the_no_horse_bucket', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: null },
      ])

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 500 }])
    })

    it('should_throw_when_getPaidCharges_rejects', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockRejectedValue(new Error('charges error'))

      await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('gross income (pre-cut fees) (#971)', () => {
    it('should_not_subtract_cut_before_splitting_across_two_horses', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([
        { lesson_id: 'lesson-1', horse_id: 'horse-1' },
        { lesson_id: 'lesson-1', horse_id: 'horse-2' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result.every((r) => r.totalIncome === 50)).toBe(true)
    })

    it('should_ignore_cut_regardless_of_horse_count', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 90, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([
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

    it('should_not_apply_cut_to_charge_income', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 500 }])
    })

    it('should_report_the_full_fee_for_a_comped_lesson_ignoring_cut', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 0, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 0 }])
    })

    it('should_not_subtract_cut_from_no_horse_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([])

      const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 100 }])
    })
  })
})

describe('getRiderIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(getLessonJunctionRows).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_when_no_lessons_in_range', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_not_fetch_lesson_riders_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(getLessonJunctionRows).not.toHaveBeenCalled()
  })

  it('should_fold_zero_rider_lesson_into_no_rider_row', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([])

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 100 }])
  })

  it('should_return_full_fee_for_single_rider_lesson', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 100 }])
  })

  it('should_allocate_half_fee_to_each_of_two_riders', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-1', rider_id: 'mem-2' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result.every((r) => r.totalIncome === 50)).toBe(true)
  })

  it('should_allocate_equal_share_to_each_rider_when_splitting_across_three', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 90, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-1', rider_id: 'mem-2' },
      { lesson_id: 'lesson-1', rider_id: 'mem-3' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result.every((r) => r.totalIncome === 30)).toBe(true)
  })

  it('should_aggregate_income_across_multiple_lessons_for_same_rider', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 50, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-1' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 150 }])
  })

  it('should_sort_riders_descending_by_income', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 90, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 60, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-2' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_fold_zero_rider_lesson_fee_into_no_rider_row_alongside_real_riders', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 80, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([
      { riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 100 },
      { riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 80 },
    ])
  })

  it('should_use_membership_id_as_fallback_name_when_membership_not_found', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-orphan' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ riderId: 'mem-orphan', riderName: 'mem-orphan', totalIncome: 100 }])
  })

  it('should_scope_resolveMemberNames_to_barn', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getRiderIncomeSummary('barn-1', startDate, endDate)

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-1'], 'barn-1', expect.anything())
  })

  it('should_throw_on_lessons_query_error', async () => {
    vi.mocked(getLessonFeeRows).mockRejectedValue(new Error('lessons error'))

    await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_lesson_riders_query_error', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockRejectedValue(new Error('lr error'))

    await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lr error')
  })

  describe('agreement charge folding', () => {
    it('should_include_rider_income_from_a_charge_when_there_are_no_lessons', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 500 }])
    })

    it('should_add_full_charge_fee_without_splitting', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
        { chargeId: 'charge-2', agreementId: 'agreement-2', period: calendarDate('2026-05-01'), fee: 200, kind: 'lease', riderId: 'mem-1', horseId: 'horse-2' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 700 }])
    })

    it('should_combine_lesson_split_income_and_charge_income_for_same_rider', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 600 }])
    })

    it('should_fold_a_charge_with_a_null_riderId_into_the_no_rider_bucket', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: null, horseId: 'horse-1' },
      ])

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 500 }])
    })

    it('should_throw_when_getPaidCharges_rejects', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockRejectedValue(new Error('charges error'))

      await expect(getRiderIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('gross income (pre-cut fees) (#971)', () => {
    it('should_not_subtract_cut_before_splitting_across_two_riders', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([
        { lesson_id: 'lesson-1', rider_id: 'mem-1' },
        { lesson_id: 'lesson-1', rider_id: 'mem-2' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result.every((r) => r.totalIncome === 50)).toBe(true)
    })

    it('should_ignore_cut_regardless_of_rider_count', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 90, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([
        { lesson_id: 'lesson-1', rider_id: 'mem-1' },
        { lesson_id: 'lesson-1', rider_id: 'mem-2' },
        { lesson_id: 'lesson-1', rider_id: 'mem-3' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result.every((r) => r.totalIncome === 30)).toBe(true)
    })

    it('should_not_apply_cut_to_charge_income', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 500 }])
    })

    it('should_report_the_full_fee_for_a_comped_lesson_ignoring_cut', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 0, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: 'mem-1', riderName: 'Alice Rider', totalIncome: 0 }])
    })

    it('should_not_subtract_cut_from_no_rider_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([])

      const result = await getRiderIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 100 }])
    })
  })
})

describe('getTrainerIncomeSummary', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getChargesForSummary).mockReset()
    vi.mocked(getChargesForSummary).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_when_no_collected_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_fold_null_instructor_lessons_into_no_instructor_row', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: NO_INSTRUCTOR_LABEL, trainerName: NO_INSTRUCTOR_LABEL, totalIncome: 100, grossIncome: 100 }])
  })

  it('should_resolve_member_names_with_empty_array_when_no_collected_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])

    await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(resolveMemberNames).toHaveBeenCalledWith([], 'barn-1', expect.anything())
  })

  it('should_return_full_fee_for_single_trainer', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-2', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: 100, grossIncome: 100 }])
  })

  it('should_aggregate_income_across_multiple_lessons_for_same_trainer', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-3', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-4', fee: 75, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: 175, grossIncome: 175 }])
  })

  it('should_return_two_entries_for_two_trainers', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-5', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-6', fee: 50, instructorCut: 0, collected: true, instructorId: 'mem-trainer-2', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
      ['mem-trainer-1', 'Jane Smith'],
      ['mem-trainer-2', 'Bob Jones'],
    ]))

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(2)
  })

  it('should_sort_descending_by_total_income', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-7', fee: 50, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-8', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-2', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
      ['mem-trainer-1', 'Jane Smith'],
      ['mem-trainer-2', 'Bob Jones'],
    ]))

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_use_trainer_id_as_fallback_when_not_found_in_membership_map', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-9', fee: 80, instructorCut: 0, collected: true, instructorId: 'mem-orphan', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].trainerName).toBe('mem-orphan')
  })

  it('should_throw_on_lessons_query_error', async () => {
    vi.mocked(getLessonFeeRows).mockRejectedValue(new Error('lessons error'))

    await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_resolveMemberNames_error', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-10', fee: 80, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve error'))

    await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('resolve error')
  })

  describe('no instructor folding', () => {
    it('should_fold_null_instructor_lesson_alongside_a_named_trainer', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-11', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
        { lessonId: 'lesson-12', fee: 60, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([
        { trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: 100, grossIncome: 100 },
        { trainerId: NO_INSTRUCTOR_LABEL, trainerName: NO_INSTRUCTOR_LABEL, totalIncome: 60, grossIncome: 60 },
      ])
    })

    it('should_subtract_cut_from_no_instructor_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-13', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ trainerId: NO_INSTRUCTOR_LABEL, trainerName: NO_INSTRUCTOR_LABEL, totalIncome: 75, grossIncome: 100 }])
    })

    it('should_not_append_no_instructor_row_when_all_lessons_have_a_trainer', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-14', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result.some((r) => r.trainerId === NO_INSTRUCTOR_LABEL)).toBe(false)
    })
  })

  describe('agreement charge folding', () => {
    it('should_append_non_lesson_income_row_when_charges_are_collected', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: calendarDate('2026-05-01'), fee: 300, payment_type: 'venmo' }])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([
        { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null },
      ])
    })

    it('should_not_append_non_lesson_income_row_when_no_charges_are_collected', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-15', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))
      vi.mocked(getChargesForSummary).mockResolvedValue([])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result.some((r) => r.trainerId === NON_LESSON_INCOME_LABEL)).toBe(false)
    })

    it('should_only_count_collected_charges_in_non_lesson_income_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([
        { period: calendarDate('2026-05-01'), fee: 300, payment_type: 'venmo' },
        { period: calendarDate('2026-05-01'), fee: 150, payment_type: null },
      ])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([
        { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null },
      ])
    })

    it('should_throw_when_charges_query_fails', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockRejectedValue(new Error('charges error'))

      await expect(getTrainerIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_subtract_cut_per_lesson_for_trainer_income', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-16', fee: 100, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
        { lessonId: 'lesson-17', fee: 75, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: 125, grossIncome: 175 }])
    })

    it('should_not_apply_cut_to_non_lesson_income_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: calendarDate('2026-05-01'), fee: 300, payment_type: 'venmo' }])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([
        { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null },
      ])
    })

    it('should_allow_negative_income_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-18', fee: 0, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result).toEqual([{ trainerId: 'mem-trainer-1', trainerName: 'Jane Smith', totalIncome: -25, grossIncome: 0 }])
    })
  })

  describe('gross income (pre-cut fees)', () => {
    it('should_report_raw_fee_sum_uncut_for_a_trainer', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-19', fee: 100, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
        { lessonId: 'lesson-20', fee: 75, instructorCut: 10, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result[0].grossIncome).toBe(175)
    })

    it('should_track_gross_income_separately_per_trainer', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([
        { lessonId: 'lesson-21', fee: 100, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
        { lessonId: 'lesson-22', fee: 50, instructorCut: 0, collected: true, instructorId: 'mem-trainer-2', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      ])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
        ['mem-trainer-1', 'Jane Smith'],
        ['mem-trainer-2', 'Bob Jones'],
      ]))

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      const gross = new Map(result.map((r) => [r.trainerId, r.grossIncome]))
      expect([gross.get('mem-trainer-1'), gross.get('mem-trainer-2')]).toEqual([100, 50])
    })

    it('should_return_null_gross_income_for_non_lesson_income_row', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(getChargesForSummary).mockResolvedValue([{ period: calendarDate('2026-05-01'), fee: 300, payment_type: 'venmo' }])

      const result = await getTrainerIncomeSummary('barn-1', startDate, endDate)

      expect(result.find((r) => r.trainerId === NON_LESSON_INCOME_LABEL)?.grossIncome).toBeNull()
    })
  })
})

