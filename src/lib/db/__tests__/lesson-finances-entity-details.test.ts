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
  getHorseIncomeDetail,
  getRiderIncomeDetail,
  getTrainerIncomeDetail,
} from '../lesson-finances'
import {
  getLessonFeeRows,
  getLessonJunctionRows,
} from '../lesson-finance-queries'
import { resolveMemberNames } from '../member-names'
import { resolveHorseNames } from '../horses'
import { getPaidCharges } from '../agreement-finances'

describe('getHorseIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(getLessonJunctionRows).mockReset()
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_empty_rows_and_horse_name_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result).toEqual({ horseName: 'Thunderbolt', rows: [], chargeRows: [], total: 0 })
  })

  it('should_not_fetch_lesson_horses_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(getLessonJunctionRows).not.toHaveBeenCalled()
  })

  it('should_return_horse_id_as_fallback_name_when_horse_not_found', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.horseName).toBe('horse-1')
  })

  it('should_return_row_with_full_fee_when_single_horse_in_lesson', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(100)
  })

  it('should_return_horse_count_of_one_when_single_horse_in_lesson', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].horseCount).toBe(1)
  })

  it('should_split_fee_evenly_when_two_horses_in_lesson', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-1', horse_id: 'horse-2' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(50)
  })

  it('should_only_include_lessons_where_horse_participated', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 80, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-15T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-2' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_in_row', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].lessonId).toBe('lesson-1')
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 60, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-15T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', horse_id: 'horse-1' },
      { lesson_id: 'lesson-2', horse_id: 'horse-1' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_throw_on_lessons_error', async () => {
    vi.mocked(getLessonFeeRows).mockRejectedValue(new Error('lessons error'))
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_on_horse_name_resolution_error', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveHorseNames).mockRejectedValue(new Error('horse error'))

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('horse error')
  })

  it('should_throw_on_lesson_horses_error', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(getLessonJunctionRows).mockRejectedValue(new Error('lh error'))

    await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('lh error')
  })

  describe('agreement charge folding', () => {
    it('should_include_a_charge_row_for_the_horse', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
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
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-2' },
      ])

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.chargeRows).toEqual([])
    })

    it('should_add_charge_fee_to_total', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.total).toBe(600)
    })

    it('should_throw_when_getPaidCharges_rejects', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockRejectedValue(new Error('charges error'))

      await expect(getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_net_cut_from_row_fee_when_single_horse_in_lesson', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.rows[0].fee).toBe(75)
    })

    it('should_net_cut_once_before_splitting_across_two_horses', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([
        { lesson_id: 'lesson-1', horse_id: 'horse-1' },
        { lesson_id: 'lesson-1', horse_id: 'horse-2' },
      ])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.rows[0].splitAmount).toBe(37.5)
    })

    it('should_not_apply_cut_to_charge_rows_or_total', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.total).toBe(500)
    })

    it('should_allow_negative_row_fee_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 0, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
      vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

      const result = await getHorseIncomeDetail('barn-1', 'horse-1', startDate, endDate)

      expect(result.total).toBe(-25)
    })
  })
})

describe('getRiderIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(getLessonJunctionRows).mockReset()
    vi.mocked(getPaidCharges).mockReset()
    vi.mocked(getPaidCharges).mockResolvedValue([])
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_rider_name_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('Alice Rider')
  })

  it('should_return_empty_rows_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_return_zero_total_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.total).toBe(0)
  })

  it('should_not_fetch_lesson_riders_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(getLessonJunctionRows).not.toHaveBeenCalled()
  })

  it('should_fall_back_to_rider_id_when_name_not_resolved', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.riderName).toBe('mem-1')
  })

  it('should_scope_resolveMemberNames_to_barn_and_rider_id', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-1'], 'barn-1', expect.anything())
  })

  it('should_return_row_with_full_fee_when_single_rider_in_lesson', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(100)
  })

  it('should_split_fee_evenly_when_two_riders_in_lesson', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-1', rider_id: 'mem-2' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(50)
  })

  it('should_only_include_lessons_where_rider_participated', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 80, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-15T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-2' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_in_row', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.rows[0].lessonId).toBe('lesson-1')
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 60, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-15T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-1' },
      { lesson_id: 'lesson-2', rider_id: 'mem-1' },
    ])

    const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_throw_on_lessons_error', async () => {
    vi.mocked(getLessonFeeRows).mockRejectedValue(new Error('lessons error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_resolveMemberNames_rejects', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('resolve error')
  })

  it('should_throw_on_lesson_riders_error', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getLessonJunctionRows).mockRejectedValue(new Error('lr error'))

    await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('lr error')
  })

  describe('agreement charge folding', () => {
    it('should_include_a_charge_row_for_the_rider', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
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
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-2', horseId: 'horse-1' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.chargeRows).toEqual([])
    })

    it('should_add_charge_fee_to_total', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.total).toBe(600)
    })

    it('should_throw_when_getPaidCharges_rejects', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockRejectedValue(new Error('charges error'))

      await expect(getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)).rejects.toThrow('charges error')
    })
  })

  describe('instructor cut netting', () => {
    it('should_net_cut_from_row_fee_when_single_rider_in_lesson', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.rows[0].fee).toBe(75)
    })

    it('should_net_cut_once_before_splitting_across_two_riders', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getLessonJunctionRows).mockResolvedValue([
        { lesson_id: 'lesson-1', rider_id: 'mem-1' },
        { lesson_id: 'lesson-1', rider_id: 'mem-2' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.rows[0].splitAmount).toBe(37.5)
    })

    it('should_not_apply_cut_to_charge_rows_or_total', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getPaidCharges).mockResolvedValue([
        { chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', fee: 500, kind: 'board', riderId: 'mem-1', horseId: 'horse-1' },
      ])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.total).toBe(500)
    })

    it('should_allow_negative_row_fee_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
      vi.mocked(getLessonFeeRows).mockResolvedValue([{ lessonId: 'lesson-1', fee: 0, instructorCut: 25, collected: true, instructorId: null, occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' }])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
      vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])

      const result = await getRiderIncomeDetail('barn-1', 'mem-1', startDate, endDate)

      expect(result.total).toBe(-25)
    })
  })
})

describe('getTrainerIncomeDetail', () => {
  beforeEach(() => {
    vi.mocked(getLessonFeeRows).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  it('should_return_trainer_name_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-trainer-1', 'Jane Smith']]))

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.trainerName).toBe('Jane Smith')
  })

  it('should_return_empty_rows_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_return_zero_total_when_no_paid_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.total).toBe(0)
  })

  it('should_fall_back_to_trainer_id_when_name_not_resolved', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.trainerName).toBe('mem-trainer-1')
  })

  it('should_scope_resolveMemberNames_to_barn_and_trainer_id', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-trainer-1'], 'barn-1', expect.anything())
  })

  it('should_only_include_lessons_this_trainer_instructed', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 80, instructorCut: 0, collected: true, instructorId: 'mem-trainer-2', occurredAt: '2026-05-15T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.rows).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_and_date_in_row', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.rows[0]).toEqual({ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100 })
  })

  it('should_net_the_instructor_cut_from_the_row_fee', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.rows[0].fee).toBe(75)
  })

  it('should_accumulate_total_across_multiple_lessons', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 100, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
      { lessonId: 'lesson-2', fee: 60, instructorCut: 0, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-15T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_allow_negative_row_fee_for_a_comped_lesson_and_not_clamp_to_zero', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 0, instructorCut: 25, collected: true, instructorId: 'mem-trainer-1', occurredAt: '2026-05-10T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)

    expect(result.total).toBe(-25)
  })

  it('should_throw_on_lessons_error', async () => {
    vi.mocked(getLessonFeeRows).mockRejectedValue(new Error('lessons error'))

    await expect(getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_resolveMemberNames_rejects', async () => {
    vi.mocked(getLessonFeeRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve error'))

    await expect(getTrainerIncomeDetail('barn-1', 'mem-trainer-1', startDate, endDate)).rejects.toThrow('resolve error')
  })
})

