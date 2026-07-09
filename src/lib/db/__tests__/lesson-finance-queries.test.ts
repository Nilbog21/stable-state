import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('../lesson-participants')
vi.mock('../barn-memberships')

import { createClient } from '@/lib/supabase/server'
import { getRiderEnrolledLessonIds } from '../lesson-participants'
import { getUserMembership } from '../barn-memberships'
import {
  getLessonsForSummary,
  getTierPricesByNames,
  getOutstandingLessonRows,
  getLessonJunctionRows,
  getPaidLessonRows,
} from '../lesson-finance-queries'

describe('getLessonsForSummary', () => {
  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockEq, mockGte, mockLt }
  }

  it('should_query_the_lessons_table', async () => {
    const { from } = makeChain([])
    await getLessonsForSummary('barn-1', startDate, endDate)
    expect(from).toHaveBeenCalledWith('lessons')
  })

  it('should_filter_by_barn_id', async () => {
    const { mockEq } = makeChain([])
    await getLessonsForSummary('barn-1', startDate, endDate)
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_start_date', async () => {
    const { mockGte } = makeChain([])
    await getLessonsForSummary('barn-1', startDate, endDate)
    expect(mockGte).toHaveBeenCalledWith('lesson_at', startDate.toISOString())
  })

  it('should_filter_by_end_date', async () => {
    const { mockLt } = makeChain([])
    await getLessonsForSummary('barn-1', startDate, endDate)
    expect(mockLt).toHaveBeenCalledWith('lesson_at', endDate.toISOString())
  })

  it('should_return_the_raw_rows', async () => {
    const lesson = createMockLesson({ fee: 75 })
    makeChain([lesson])
    const result = await getLessonsForSummary('barn-1', startDate, endDate)
    expect(result).toEqual([lesson])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getLessonsForSummary('barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeChain(null, new Error('db error'))
    await expect(getLessonsForSummary('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getLessonsForSummary('barn-1', startDate, endDate, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lessons')
  })
})

describe('getTierPricesByNames', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockEq, mockIn }
  }

  it('should_not_query_when_names_is_empty', async () => {
    const { from } = makeChain([])
    await getTierPricesByNames('barn-1', [])
    expect(from).not.toHaveBeenCalled()
  })

  it('should_return_empty_array_when_names_is_empty', async () => {
    makeChain([])
    const result = await getTierPricesByNames('barn-1', [])
    expect(result).toEqual([])
  })

  it('should_filter_by_barn_id', async () => {
    const { mockEq } = makeChain([])
    await getTierPricesByNames('barn-1', ['Standard'])
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_names', async () => {
    const { mockIn } = makeChain([])
    await getTierPricesByNames('barn-1', ['Standard', 'Basic'])
    expect(mockIn).toHaveBeenCalledWith('name', ['Standard', 'Basic'])
  })

  it('should_return_the_raw_rows', async () => {
    makeChain([{ name: 'Standard', price: 50 }])
    const result = await getTierPricesByNames('barn-1', ['Standard'])
    expect(result).toEqual([{ name: 'Standard', price: 50 }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getTierPricesByNames('barn-1', ['Standard'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeChain(null, new Error('tiers error'))
    await expect(getTierPricesByNames('barn-1', ['Standard'])).rejects.toThrow('tiers error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getTierPricesByNames('barn-1', ['Standard'], mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lesson_tiers')
  })
})

describe('getOutstandingLessonRows', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getRiderEnrolledLessonIds).mockReset()
    vi.mocked(getUserMembership).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeDefaultChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockEq, mockIs, mockLt, mockOrder }
  }

  function makeTrainerChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEqInstructor = vi.fn().mockReturnValue({ order: mockOrder })
    const mockLt = vi.fn().mockReturnValue({ eq: mockEqInstructor })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEqBarn = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockEqInstructor, mockOrder }
  }

  function makeRiderChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEqBarn = vi.fn().mockReturnValue({ is: mockIs })
    const mockIn = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockIn, mockEqBarn, mockLt, mockOrder }
  }

  describe('manager/default path', () => {
    it('should_filter_by_barn_id', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { mockEq } = makeDefaultChain([])
      await getOutstandingLessonRows('barn-1')
      expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_filter_by_null_payment_type', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { mockIs } = makeDefaultChain([])
      await getOutstandingLessonRows('barn-1')
      expect(mockIs).toHaveBeenCalledWith('payment_type', null)
    })

    it('should_filter_lessons_before_now', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { mockLt } = makeDefaultChain([])
      await getOutstandingLessonRows('barn-1')
      expect(mockLt).toHaveBeenCalledWith('lesson_at', new Date('2026-06-15T12:00:00Z').toISOString())
    })

    it('should_sort_ascending_by_lesson_at', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { mockOrder } = makeDefaultChain([])
      await getOutstandingLessonRows('barn-1')
      expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
    })

    it('should_exclude_zero_fee_lessons', async () => {
      const lesson = createMockLesson({ fee: 0, payment_type: null })
      makeDefaultChain([lesson])
      const result = await getOutstandingLessonRows('barn-1')
      expect(result).toHaveLength(0)
    })

    it('should_include_non_zero_fee_lessons', async () => {
      const lesson = createMockLesson({ fee: 50, payment_type: null })
      makeDefaultChain([lesson])
      const result = await getOutstandingLessonRows('barn-1')
      expect(result).toHaveLength(1)
    })

    it('should_return_empty_array_when_data_is_null', async () => {
      makeDefaultChain(null)
      const result = await getOutstandingLessonRows('barn-1')
      expect(result).toEqual([])
    })

    it('should_not_apply_instructor_filter_for_manager_role', async () => {
      makeDefaultChain([])
      const result = await getOutstandingLessonRows('barn-1', 'user-mgr', 'manager')
      expect(result).toEqual([])
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      makeDefaultChain(null, new Error('db error'))
      await expect(getOutstandingLessonRows('barn-1')).rejects.toThrow('db error')
    })
  })

  describe('trainer path', () => {
    it('should_resolve_instructor_filter_to_the_callers_membership_id', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      const { mockEqInstructor } = makeTrainerChain([])
      await getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')
      expect(mockEqInstructor).toHaveBeenCalledWith('instructor_id', 'mem-trainer-1')
    })

    it('should_return_empty_array_when_caller_has_no_membership', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      makeTrainerChain([])
      const result = await getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')
      expect(result).toEqual([])
    })

    it('should_exclude_zero_fee_lessons', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      const lesson = createMockLesson({ fee: 0, payment_type: null })
      makeTrainerChain([lesson])
      const result = await getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')
      expect(result).toHaveLength(0)
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      makeTrainerChain(null, new Error('trainer error'))
      await expect(getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')).rejects.toThrow('trainer error')
    })
  })

  describe('rider path', () => {
    it('should_not_query_lessons_when_rider_has_no_enrollments', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      const { from } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(from).not.toHaveBeenCalled()
    })

    it('should_return_empty_array_when_rider_has_no_enrollments', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      makeRiderChain([])
      const result = await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(result).toEqual([])
    })

    it('should_query_lessons_by_enrolled_lesson_ids', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { mockIn } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(mockIn).toHaveBeenCalledWith('id', ['lesson-1'])
    })

    it('should_pass_the_resolved_client_through_to_getRiderEnrolledLessonIds', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(getRiderEnrolledLessonIds).toHaveBeenCalledWith('barn-1', 'user-rider', expect.anything())
    })

    it('should_filter_by_barn_id', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { mockEqBarn } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_filter_lessons_before_now', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { mockLt } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(mockLt).toHaveBeenCalledWith('lesson_at', new Date('2026-06-15T12:00:00Z').toISOString())
    })

    it('should_sort_ascending_by_lesson_at', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { mockOrder } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
    })

    it('should_exclude_zero_fee_lessons', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const lesson = createMockLesson({ id: 'lesson-1', fee: 0, payment_type: null })
      makeRiderChain([lesson])
      const result = await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(result).toHaveLength(0)
    })

    it('should_include_lessons_with_non_zero_fee', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50, payment_type: null })
      makeRiderChain([lesson])
      const result = await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(result).toHaveLength(1)
    })

    it('should_return_empty_array_when_data_is_null', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      makeRiderChain(null)
      const result = await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(result).toEqual([])
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      makeRiderChain(null, new Error('rider lessons error'))
      await expect(getOutstandingLessonRows('barn-1', 'user-rider', 'rider')).rejects.toThrow('rider lessons error')
    })

    it('should_propagate_error_from_getRiderEnrolledLessonIds', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockRejectedValue(new Error('enrollment lookup error'))
      makeRiderChain([])
      await expect(getOutstandingLessonRows('barn-1', 'user-rider', 'rider')).rejects.toThrow('enrollment lookup error')
    })

    it('should_not_take_rider_path_when_userId_is_missing', async () => {
      makeDefaultChain([])
      await getOutstandingLessonRows('barn-1', undefined, 'rider')
      expect(getRiderEnrolledLessonIds).not.toHaveBeenCalled()
    })
  })

  it('should_use_injected_client_when_provided', async () => {
    vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getOutstandingLessonRows('barn-1', undefined, undefined, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lessons')
  })
})

describe('getLessonJunctionRows', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockSelect, mockEq, mockIn }
  }

  it('should_not_query_when_lesson_ids_is_empty', async () => {
    const { from } = makeChain([])
    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', [])
    expect(from).not.toHaveBeenCalled()
  })

  it('should_return_empty_array_when_lesson_ids_is_empty', async () => {
    makeChain([])
    const result = await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', [])
    expect(result).toEqual([])
  })

  it('should_query_the_given_rider_table', async () => {
    const { from } = makeChain([])
    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    expect(from).toHaveBeenCalledWith('lesson_riders')
  })

  it('should_query_the_given_horse_table', async () => {
    const { from } = makeChain([])
    await getLessonJunctionRows('lesson_horses', 'horse_id', 'barn-1', ['lesson-1'])
    expect(from).toHaveBeenCalledWith('lesson_horses')
  })

  it('should_select_lesson_id_and_the_given_participant_column', async () => {
    const { mockSelect } = makeChain([])
    await getLessonJunctionRows('lesson_horses', 'horse_id', 'barn-1', ['lesson-1'])
    expect(mockSelect).toHaveBeenCalledWith('lesson_id, horse_id')
  })

  it('should_filter_by_barn_id', async () => {
    const { mockEq } = makeChain([])
    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_lesson_ids', async () => {
    const { mockIn } = makeChain([])
    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1', 'lesson-2'])
    expect(mockIn).toHaveBeenCalledWith('lesson_id', ['lesson-1', 'lesson-2'])
  })

  it('should_return_the_raw_rows', async () => {
    makeChain([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    const result = await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    expect(result).toEqual([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeChain(null, new Error('junction error'))
    await expect(
      getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    ).rejects.toThrow('junction error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'], mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lesson_riders')
  })
})

describe('getPaidLessonRows', () => {
  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockSelect, mockEq, mockNot, mockGte, mockLt, mockOrder }
  }

  it('should_filter_by_barn_id', async () => {
    const { mockEq } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, ['id'])
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_non_null_payment_type', async () => {
    const { mockNot } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, ['id'])
    expect(mockNot).toHaveBeenCalledWith('payment_type', 'is', null)
  })

  it('should_filter_by_start_date', async () => {
    const { mockGte } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, ['id'])
    expect(mockGte).toHaveBeenCalledWith('lesson_at', startDate.toISOString())
  })

  it('should_filter_by_end_date', async () => {
    const { mockLt } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, ['id'])
    expect(mockLt).toHaveBeenCalledWith('lesson_at', endDate.toISOString())
  })

  it('should_sort_ascending_by_lesson_at', async () => {
    const { mockOrder } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, ['id'])
    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
  })

  it('should_always_select_fee', async () => {
    const { mockSelect } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, [])
    expect(mockSelect).toHaveBeenCalledWith('fee')
  })

  it('should_select_fee_plus_the_given_id_column', async () => {
    const { mockSelect } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, ['id'])
    expect(mockSelect).toHaveBeenCalledWith('fee, id')
  })

  it('should_select_fee_plus_the_given_instructor_column', async () => {
    const { mockSelect } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, ['instructor_id'])
    expect(mockSelect).toHaveBeenCalledWith('fee, instructor_id')
  })

  it('should_select_fee_plus_the_given_id_and_lesson_at_columns', async () => {
    const { mockSelect } = makeChain([])
    await getPaidLessonRows('barn-1', startDate, endDate, ['id', 'lesson_at'])
    expect(mockSelect).toHaveBeenCalledWith('fee, id, lesson_at')
  })

  it('should_return_the_raw_rows', async () => {
    const row = { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }
    makeChain([row])
    const result = await getPaidLessonRows('barn-1', startDate, endDate, ['id', 'lesson_at'])
    expect(result).toEqual([row])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getPaidLessonRows('barn-1', startDate, endDate, ['id'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeChain(null, new Error('lessons error'))
    await expect(getPaidLessonRows('barn-1', startDate, endDate, ['id'])).rejects.toThrow('lessons error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getPaidLessonRows('barn-1', startDate, endDate, ['id'], mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lessons')
  })
})
