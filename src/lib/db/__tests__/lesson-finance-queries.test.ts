import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('../lesson-participants')
vi.mock('../barn-memberships')

import { getRiderEnrolledLessonIds } from '../lesson-participants'
import { getUserMembership } from '../barn-memberships'
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

describe('getLessonsForSummary', () => {
  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEq, mockGte, mockLt }
  }

  it('should_query_the_lessons_table', async () => {
    const { client, from } = makeChain([])
    await getLessonsForSummary(client, 'barn-1', startDate, endDate)
    expect(from).toHaveBeenCalledWith('lessons')
  })

  it('should_filter_by_barn_id', async () => {
    const { client, mockEq } = makeChain([])
    await getLessonsForSummary(client, 'barn-1', startDate, endDate)
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_start_date', async () => {
    const { client, mockGte } = makeChain([])
    await getLessonsForSummary(client, 'barn-1', startDate, endDate)
    expect(mockGte).toHaveBeenCalledWith('lesson_at', startDate.toISOString())
  })

  it('should_filter_by_end_date', async () => {
    const { client, mockLt } = makeChain([])
    await getLessonsForSummary(client, 'barn-1', startDate, endDate)
    expect(mockLt).toHaveBeenCalledWith('lesson_at', endDate.toISOString())
  })

  it('should_return_the_raw_rows', async () => {
    const lesson = createMockLesson({ fee: 75 })
    const { client } = makeChain([lesson])
    const result = await getLessonsForSummary(client, 'barn-1', startDate, endDate)
    expect(result).toEqual([lesson])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { client } = makeChain(null)
    const result = await getLessonsForSummary(client, 'barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('db error'))
    await expect(getLessonsForSummary(client, 'barn-1', startDate, endDate)).rejects.toThrow('db error')
  })
})

describe('getTierPricesByNames', () => {
  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEq, mockIn }
  }

  it('should_not_query_when_names_is_empty', async () => {
    const { client, from } = makeChain([])
    await getTierPricesByNames(client, 'barn-1', [])
    expect(from).not.toHaveBeenCalled()
  })

  it('should_return_empty_array_when_names_is_empty', async () => {
    const { client } = makeChain([])
    const result = await getTierPricesByNames(client, 'barn-1', [])
    expect(result).toEqual([])
  })

  it('should_filter_by_barn_id', async () => {
    const { client, mockEq } = makeChain([])
    await getTierPricesByNames(client, 'barn-1', ['Standard'])
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_names', async () => {
    const { client, mockIn } = makeChain([])
    await getTierPricesByNames(client, 'barn-1', ['Standard', 'Basic'])
    expect(mockIn).toHaveBeenCalledWith('name', ['Standard', 'Basic'])
  })

  it('should_return_the_raw_rows', async () => {
    const { client } = makeChain([{ name: 'Standard', price: 50 }])
    const result = await getTierPricesByNames(client, 'barn-1', ['Standard'])
    expect(result).toEqual([{ name: 'Standard', price: 50 }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { client } = makeChain(null)
    const result = await getTierPricesByNames(client, 'barn-1', ['Standard'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('tiers error'))
    await expect(getTierPricesByNames(client, 'barn-1', ['Standard'])).rejects.toThrow('tiers error')
  })
})

describe('getOutstandingLessonRows', () => {
  beforeEach(() => {
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
    return { client: { from } as any, from, mockEq, mockIs, mockLt, mockOrder }
  }

  function makeTrainerChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEqInstructor = vi.fn().mockReturnValue({ order: mockOrder })
    const mockLt = vi.fn().mockReturnValue({ eq: mockEqInstructor })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEqBarn = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEqInstructor, mockOrder }
  }

  function makeRiderChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEqBarn = vi.fn().mockReturnValue({ is: mockIs })
    const mockIn = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockIn, mockEqBarn, mockLt, mockOrder }
  }

  describe('manager/default path', () => {
    it('should_filter_by_barn_id', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { client, mockEq } = makeDefaultChain([])
      await getOutstandingLessonRows(client, 'barn-1')
      expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_filter_by_null_payment_type', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { client, mockIs } = makeDefaultChain([])
      await getOutstandingLessonRows(client, 'barn-1')
      expect(mockIs).toHaveBeenCalledWith('payment_type', null)
    })

    it('should_filter_lessons_before_now', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { client, mockLt } = makeDefaultChain([])
      await getOutstandingLessonRows(client, 'barn-1')
      expect(mockLt).toHaveBeenCalledWith('lesson_at', new Date('2026-06-15T12:00:00Z').toISOString())
    })

    it('should_sort_ascending_by_lesson_at', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { client, mockOrder } = makeDefaultChain([])
      await getOutstandingLessonRows(client, 'barn-1')
      expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
    })

    it('should_exclude_zero_fee_lessons', async () => {
      const lesson = createMockLesson({ fee: 0, payment_type: null })
      const { client } = makeDefaultChain([lesson])
      const result = await getOutstandingLessonRows(client, 'barn-1')
      expect(result).toHaveLength(0)
    })

    it('should_include_null_fee_lessons', async () => {
      const lesson = createMockLesson({ fee: null, payment_type: null })
      const { client } = makeDefaultChain([lesson])
      const result = await getOutstandingLessonRows(client, 'barn-1')
      expect(result).toHaveLength(1)
    })

    it('should_include_non_zero_fee_lessons', async () => {
      const lesson = createMockLesson({ fee: 50, payment_type: null })
      const { client } = makeDefaultChain([lesson])
      const result = await getOutstandingLessonRows(client, 'barn-1')
      expect(result).toHaveLength(1)
    })

    it('should_return_empty_array_when_data_is_null', async () => {
      const { client } = makeDefaultChain(null)
      const result = await getOutstandingLessonRows(client, 'barn-1')
      expect(result).toEqual([])
    })

    it('should_not_apply_instructor_filter_for_manager_role', async () => {
      const { client } = makeDefaultChain([])
      const result = await getOutstandingLessonRows(client, 'barn-1', 'user-mgr', 'manager')
      expect(result).toEqual([])
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      const { client } = makeDefaultChain(null, new Error('db error'))
      await expect(getOutstandingLessonRows(client, 'barn-1')).rejects.toThrow('db error')
    })
  })

  describe('trainer path', () => {
    it('should_resolve_instructor_filter_to_the_callers_membership_id', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      const { client, mockEqInstructor } = makeTrainerChain([])
      await getOutstandingLessonRows(client, 'barn-1', 'user-trainer', 'trainer')
      expect(mockEqInstructor).toHaveBeenCalledWith('instructor_id', 'mem-trainer-1')
    })

    it('should_return_empty_array_when_caller_has_no_membership', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      const { client } = makeTrainerChain([])
      const result = await getOutstandingLessonRows(client, 'barn-1', 'user-trainer', 'trainer')
      expect(result).toEqual([])
    })

    it('should_exclude_zero_fee_lessons', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      const lesson = createMockLesson({ fee: 0, payment_type: null })
      const { client } = makeTrainerChain([lesson])
      const result = await getOutstandingLessonRows(client, 'barn-1', 'user-trainer', 'trainer')
      expect(result).toHaveLength(0)
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      const { client } = makeTrainerChain(null, new Error('trainer error'))
      await expect(getOutstandingLessonRows(client, 'barn-1', 'user-trainer', 'trainer')).rejects.toThrow('trainer error')
    })
  })

  describe('rider path', () => {
    it('should_not_query_lessons_when_rider_has_no_enrollments', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      const { client, from } = makeRiderChain([])
      await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(from).not.toHaveBeenCalled()
    })

    it('should_return_empty_array_when_rider_has_no_enrollments', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      const { client } = makeRiderChain([])
      const result = await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(result).toEqual([])
    })

    it('should_query_lessons_by_enrolled_lesson_ids', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { client, mockIn } = makeRiderChain([])
      await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(mockIn).toHaveBeenCalledWith('id', ['lesson-1'])
    })

    it('should_pass_the_injected_client_through_to_getRiderEnrolledLessonIds', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      const { client } = makeRiderChain([])
      await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(getRiderEnrolledLessonIds).toHaveBeenCalledWith('barn-1', 'user-rider', client)
    })

    it('should_filter_by_barn_id', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { client, mockEqBarn } = makeRiderChain([])
      await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_filter_lessons_before_now', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { client, mockLt } = makeRiderChain([])
      await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(mockLt).toHaveBeenCalledWith('lesson_at', new Date('2026-06-15T12:00:00Z').toISOString())
    })

    it('should_sort_ascending_by_lesson_at', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { client, mockOrder } = makeRiderChain([])
      await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
    })

    it('should_exclude_zero_fee_lessons', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const lesson = createMockLesson({ id: 'lesson-1', fee: 0, payment_type: null })
      const { client } = makeRiderChain([lesson])
      const result = await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(result).toHaveLength(0)
    })

    it('should_include_lessons_with_non_zero_fee', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50, payment_type: null })
      const { client } = makeRiderChain([lesson])
      const result = await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(result).toHaveLength(1)
    })

    it('should_return_empty_array_when_data_is_null', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { client } = makeRiderChain(null)
      const result = await getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')
      expect(result).toEqual([])
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { client } = makeRiderChain(null, new Error('rider lessons error'))
      await expect(getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')).rejects.toThrow('rider lessons error')
    })

    it('should_propagate_error_from_getRiderEnrolledLessonIds', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockRejectedValue(new Error('enrollment lookup error'))
      const { client } = makeRiderChain([])
      await expect(getOutstandingLessonRows(client, 'barn-1', 'user-rider', 'rider')).rejects.toThrow('enrollment lookup error')
    })

    it('should_not_take_rider_path_when_userId_is_missing', async () => {
      const { client } = makeDefaultChain([])
      await getOutstandingLessonRows(client, 'barn-1', undefined, 'rider')
      expect(getRiderEnrolledLessonIds).not.toHaveBeenCalled()
    })
  })
})

describe('getLessonRidersForLessons', () => {
  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEq, mockIn }
  }

  it('should_not_query_when_lesson_ids_is_empty', async () => {
    const { client, from } = makeChain([])
    await getLessonRidersForLessons(client, 'barn-1', [])
    expect(from).not.toHaveBeenCalled()
  })

  it('should_return_empty_array_when_lesson_ids_is_empty', async () => {
    const { client } = makeChain([])
    const result = await getLessonRidersForLessons(client, 'barn-1', [])
    expect(result).toEqual([])
  })

  it('should_filter_by_barn_id', async () => {
    const { client, mockEq } = makeChain([])
    await getLessonRidersForLessons(client, 'barn-1', ['lesson-1'])
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_lesson_ids', async () => {
    const { client, mockIn } = makeChain([])
    await getLessonRidersForLessons(client, 'barn-1', ['lesson-1', 'lesson-2'])
    expect(mockIn).toHaveBeenCalledWith('lesson_id', ['lesson-1', 'lesson-2'])
  })

  it('should_return_the_raw_rows', async () => {
    const { client } = makeChain([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    const result = await getLessonRidersForLessons(client, 'barn-1', ['lesson-1'])
    expect(result).toEqual([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { client } = makeChain(null)
    const result = await getLessonRidersForLessons(client, 'barn-1', ['lesson-1'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('lr error'))
    await expect(getLessonRidersForLessons(client, 'barn-1', ['lesson-1'])).rejects.toThrow('lr error')
  })
})

describe('getProfileNamesByUserIds', () => {
  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockIn }
  }

  it('should_not_query_when_user_ids_is_empty', async () => {
    const { client, from } = makeChain([])
    await getProfileNamesByUserIds(client, [])
    expect(from).not.toHaveBeenCalled()
  })

  it('should_return_empty_array_when_user_ids_is_empty', async () => {
    const { client } = makeChain([])
    const result = await getProfileNamesByUserIds(client, [])
    expect(result).toEqual([])
  })

  it('should_filter_by_user_ids', async () => {
    const { client, mockIn } = makeChain([])
    await getProfileNamesByUserIds(client, ['user-1', 'user-2'])
    expect(mockIn).toHaveBeenCalledWith('user_id', ['user-1', 'user-2'])
  })

  it('should_return_the_raw_rows', async () => {
    const { client } = makeChain([{ user_id: 'user-1', first_name: 'Jane', last_name: 'Doe' }])
    const result = await getProfileNamesByUserIds(client, ['user-1'])
    expect(result).toEqual([{ user_id: 'user-1', first_name: 'Jane', last_name: 'Doe' }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { client } = makeChain(null)
    const result = await getProfileNamesByUserIds(client, ['user-1'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('profiles error'))
    await expect(getProfileNamesByUserIds(client, ['user-1'])).rejects.toThrow('profiles error')
  })
})

describe('getPaidLessonFees', () => {
  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEq, mockNot, mockGte, mockLt }
  }

  it('should_filter_by_barn_id', async () => {
    const { client, mockEq } = makeChain([])
    await getPaidLessonFees(client, 'barn-1', startDate, endDate)
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_non_null_payment_type', async () => {
    const { client, mockNot } = makeChain([])
    await getPaidLessonFees(client, 'barn-1', startDate, endDate)
    expect(mockNot).toHaveBeenCalledWith('payment_type', 'is', null)
  })

  it('should_filter_by_start_date', async () => {
    const { client, mockGte } = makeChain([])
    await getPaidLessonFees(client, 'barn-1', startDate, endDate)
    expect(mockGte).toHaveBeenCalledWith('lesson_at', startDate.toISOString())
  })

  it('should_filter_by_end_date', async () => {
    const { client, mockLt } = makeChain([])
    await getPaidLessonFees(client, 'barn-1', startDate, endDate)
    expect(mockLt).toHaveBeenCalledWith('lesson_at', endDate.toISOString())
  })

  it('should_return_the_raw_rows', async () => {
    const { client } = makeChain([{ id: 'lesson-1', fee: 100 }])
    const result = await getPaidLessonFees(client, 'barn-1', startDate, endDate)
    expect(result).toEqual([{ id: 'lesson-1', fee: 100 }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { client } = makeChain(null)
    const result = await getPaidLessonFees(client, 'barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('lessons error'))
    await expect(getPaidLessonFees(client, 'barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })
})

describe('getLessonHorsesForLessons', () => {
  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEq, mockIn }
  }

  it('should_filter_by_barn_id', async () => {
    const { client, mockEq } = makeChain([])
    await getLessonHorsesForLessons(client, 'barn-1', ['lesson-1'])
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_lesson_ids', async () => {
    const { client, mockIn } = makeChain([])
    await getLessonHorsesForLessons(client, 'barn-1', ['lesson-1', 'lesson-2'])
    expect(mockIn).toHaveBeenCalledWith('lesson_id', ['lesson-1', 'lesson-2'])
  })

  it('should_return_the_raw_rows', async () => {
    const { client } = makeChain([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
    const result = await getLessonHorsesForLessons(client, 'barn-1', ['lesson-1'])
    expect(result).toEqual([{ lesson_id: 'lesson-1', horse_id: 'horse-1' }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { client } = makeChain(null)
    const result = await getLessonHorsesForLessons(client, 'barn-1', ['lesson-1'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('lh error'))
    await expect(getLessonHorsesForLessons(client, 'barn-1', ['lesson-1'])).rejects.toThrow('lh error')
  })
})

describe('getPaidLessonInstructorFees', () => {
  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEq, mockNot, mockGte, mockLt }
  }

  it('should_filter_by_barn_id', async () => {
    const { client, mockEq } = makeChain([])
    await getPaidLessonInstructorFees(client, 'barn-1', startDate, endDate)
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_non_null_payment_type', async () => {
    const { client, mockNot } = makeChain([])
    await getPaidLessonInstructorFees(client, 'barn-1', startDate, endDate)
    expect(mockNot).toHaveBeenCalledWith('payment_type', 'is', null)
  })

  it('should_filter_by_start_date', async () => {
    const { client, mockGte } = makeChain([])
    await getPaidLessonInstructorFees(client, 'barn-1', startDate, endDate)
    expect(mockGte).toHaveBeenCalledWith('lesson_at', startDate.toISOString())
  })

  it('should_filter_by_end_date', async () => {
    const { client, mockLt } = makeChain([])
    await getPaidLessonInstructorFees(client, 'barn-1', startDate, endDate)
    expect(mockLt).toHaveBeenCalledWith('lesson_at', endDate.toISOString())
  })

  it('should_return_the_raw_rows', async () => {
    const { client } = makeChain([{ instructor_id: 'user-1', fee: 100 }])
    const result = await getPaidLessonInstructorFees(client, 'barn-1', startDate, endDate)
    expect(result).toEqual([{ instructor_id: 'user-1', fee: 100 }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { client } = makeChain(null)
    const result = await getPaidLessonInstructorFees(client, 'barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('instructor fees error'))
    await expect(getPaidLessonInstructorFees(client, 'barn-1', startDate, endDate)).rejects.toThrow('instructor fees error')
  })
})

describe('getPaidLessonFeesAt', () => {
  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ not: mockNot })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEq, mockNot, mockGte, mockLt, mockOrder }
  }

  it('should_filter_by_barn_id', async () => {
    const { client, mockEq } = makeChain([])
    await getPaidLessonFeesAt(client, 'barn-1', startDate, endDate)
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_non_null_payment_type', async () => {
    const { client, mockNot } = makeChain([])
    await getPaidLessonFeesAt(client, 'barn-1', startDate, endDate)
    expect(mockNot).toHaveBeenCalledWith('payment_type', 'is', null)
  })

  it('should_filter_by_start_date', async () => {
    const { client, mockGte } = makeChain([])
    await getPaidLessonFeesAt(client, 'barn-1', startDate, endDate)
    expect(mockGte).toHaveBeenCalledWith('lesson_at', startDate.toISOString())
  })

  it('should_filter_by_end_date', async () => {
    const { client, mockLt } = makeChain([])
    await getPaidLessonFeesAt(client, 'barn-1', startDate, endDate)
    expect(mockLt).toHaveBeenCalledWith('lesson_at', endDate.toISOString())
  })

  it('should_sort_ascending_by_lesson_at', async () => {
    const { client, mockOrder } = makeChain([])
    await getPaidLessonFeesAt(client, 'barn-1', startDate, endDate)
    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
  })

  it('should_return_the_raw_rows', async () => {
    const row = { id: 'lesson-1', fee: 100, lesson_at: '2026-05-10T10:00:00Z' }
    const { client } = makeChain([row])
    const result = await getPaidLessonFeesAt(client, 'barn-1', startDate, endDate)
    expect(result).toEqual([row])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { client } = makeChain(null)
    const result = await getPaidLessonFeesAt(client, 'barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('fees at error'))
    await expect(getPaidLessonFeesAt(client, 'barn-1', startDate, endDate)).rejects.toThrow('fees at error')
  })
})

describe('getRiderMembership', () => {
  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEqId = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEqBarn = vi.fn().mockReturnValue({ eq: mockEqId })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEqBarn, mockEqId }
  }

  it('should_filter_by_barn_id', async () => {
    const { client, mockEqBarn } = makeChain(null)
    await getRiderMembership(client, 'barn-1', 'mem-1')
    expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_membership_id', async () => {
    const { client, mockEqId } = makeChain(null)
    await getRiderMembership(client, 'barn-1', 'mem-1')
    expect(mockEqId).toHaveBeenCalledWith('id', 'mem-1')
  })

  it('should_return_the_row_when_found', async () => {
    const { client } = makeChain({ id: 'mem-1', user_id: 'user-1' })
    const result = await getRiderMembership(client, 'barn-1', 'mem-1')
    expect(result).toEqual({ id: 'mem-1', user_id: 'user-1' })
  })

  it('should_return_null_when_not_found', async () => {
    const { client } = makeChain(null)
    const result = await getRiderMembership(client, 'barn-1', 'mem-1')
    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('membership error'))
    await expect(getRiderMembership(client, 'barn-1', 'mem-1')).rejects.toThrow('membership error')
  })
})

describe('getProfileNameByUserId', () => {
  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    return { client: { from } as any, from, mockEq }
  }

  it('should_filter_by_user_id', async () => {
    const { client, mockEq } = makeChain(null)
    await getProfileNameByUserId(client, 'user-1')
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('should_return_the_row_when_found', async () => {
    const { client } = makeChain({ first_name: 'Alice', last_name: 'Rider' })
    const result = await getProfileNameByUserId(client, 'user-1')
    expect(result).toEqual({ first_name: 'Alice', last_name: 'Rider' })
  })

  it('should_return_null_when_not_found', async () => {
    const { client } = makeChain(null)
    const result = await getProfileNameByUserId(client, 'user-1')
    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { client } = makeChain(null, new Error('profile error'))
    await expect(getProfileNameByUserId(client, 'user-1')).rejects.toThrow('profile error')
  })
})
