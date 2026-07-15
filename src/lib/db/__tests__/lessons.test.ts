import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson, createMockLessonWithDetails } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../lesson-participants', async () => {
  const actual = await vi.importActual<typeof import('../lesson-participants')>('../lesson-participants')
  return { ...actual, hydrateParticipants: vi.fn() }
})

vi.mock('../barn-memberships', async () => {
  const actual = await vi.importActual<typeof import('../barn-memberships')>('../barn-memberships')
  return { ...actual, getMembershipByIdForBarn: vi.fn() }
})

vi.mock('../member-names', () => ({
  resolveMemberNames: vi.fn(),
}))

vi.mock('../profiles', async () => {
  const actual = await vi.importActual<typeof import('../profiles')>('../profiles')
  return { ...actual, getProfileById: vi.fn() }
})

import { createClient } from '@/lib/supabase/server'
import { hydrateParticipants } from '../lesson-participants'
import { getMembershipByIdForBarn } from '../barn-memberships'
import { resolveMemberNames } from '../member-names'
import { getProfileById } from '../profiles'
import {
  createLesson,
  cancelLesson,
  collectLessonPayment,
  deleteLesson,
  getLessonsByBarn,
  getLessonById,
  getUpcomingLessons,
  updateLesson,
} from '../lessons'

const mockLesson = createMockLesson({ fee: 75, lesson_at: '2026-05-16T10:00:00Z', submitted_at: '2026-05-16T10:05:00Z' })

function makePaymentInfoRpc(rows: { lesson_id: string; payment_type: string | null }[] = [], error: Error | null = null) {
  return vi.fn().mockResolvedValue({ data: rows, error })
}

// hydrateParticipants is exercised directly in lesson-participants.test.ts;
// here it's mocked as a single unit that passes lessons through unchanged by default.
beforeEach(() => {
  vi.mocked(hydrateParticipants).mockImplementation(async (_supabase, lessons) =>
    lessons as unknown as ReturnType<typeof createMockLessonWithDetails>[]
  )
})

describe('createLesson', () => {
  it('should_insert_lesson_with_barn_id_instructor_fee_and_lesson_at', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockLesson, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createLesson({
      barnId: 'barn-1',
      instructorId: 'user-1',
      fee: 75,
      lessonAt: '2026-05-16T10:00:00Z',
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        barn_id: 'barn-1',
        instructor_id: 'user-1',
        fee: 75,
        lesson_at: '2026-05-16T10:00:00Z',
      })
    )
  })

  it('should_return_the_created_lesson', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockLesson, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createLesson({
      barnId: 'barn-1',
      instructorId: 'user-1',
      fee: 75,
      lessonAt: '2026-05-16T10:00:00Z',
    })

    expect(result).toEqual(mockLesson)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(
      createLesson({ barnId: 'barn-1', instructorId: 'user-1', fee: 75, lessonAt: '2026-05-16T10:00:00Z' })
    ).rejects.toThrow('db error')
  })
})

describe('cancelLesson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeRpcMock(error: Error | null = null) {
    const mockRpc = vi.fn().mockResolvedValue({ error })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    return mockRpc
  }

  it('should_call_the_cancel_lesson_with_transactions_rpc_with_default_params', async () => {
    const mockRpc = makeRpcMock()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockRpc).toHaveBeenCalledWith('cancel_lesson_with_transactions', {
      p_lesson_id: 'lesson-1',
      p_barn_id: 'barn-1',
      p_notes: null,
      p_is_late: false,
    })
  })

  it('should_pass_notes_through_to_the_rpc', async () => {
    const mockRpc = makeRpcMock()
    await cancelLesson('lesson-1', 'barn-1', 'Trainer unavailable')
    expect(mockRpc).toHaveBeenCalledWith('cancel_lesson_with_transactions',
      expect.objectContaining({ p_notes: 'Trainer unavailable' })
    )
  })

  it('should_pass_null_notes_when_omitted', async () => {
    const mockRpc = makeRpcMock()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockRpc).toHaveBeenCalledWith('cancel_lesson_with_transactions',
      expect.objectContaining({ p_notes: null })
    )
  })

  it('should_pass_is_late_true_through_to_the_rpc', async () => {
    const mockRpc = makeRpcMock()
    await cancelLesson('lesson-1', 'barn-1', null, true)
    expect(mockRpc).toHaveBeenCalledWith('cancel_lesson_with_transactions',
      expect.objectContaining({ p_is_late: true })
    )
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeRpcMock(new Error('db error'))
    await expect(cancelLesson('lesson-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('deleteLesson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_call_the_delete_lesson_with_transactions_rpc_with_default_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await deleteLesson('lesson-1', 'barn-1')

    expect(mockRpc).toHaveBeenCalledWith('delete_lesson_with_transactions', {
      p_lesson_id: 'lesson-1',
      p_barn_id: 'barn-1',
      p_delete_collected: false,
    })
  })

  it('should_pass_delete_collected_transactions_true_through_to_the_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await deleteLesson('lesson-1', 'barn-1', true)

    expect(mockRpc).toHaveBeenCalledWith('delete_lesson_with_transactions',
      expect.objectContaining({ p_delete_collected: true })
    )
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(deleteLesson('lesson-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('collectLessonPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_call_the_collect_lesson_payment_rpc_with_correct_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await collectLessonPayment('lesson-1', 'barn-1', 'venmo')

    expect(mockRpc).toHaveBeenCalledWith('collect_lesson_payment', {
      p_lesson_id: 'lesson-1',
      p_barn_id: 'barn-1',
      p_payment_type: 'venmo',
    })
  })

  it('should_pass_null_payment_type_through_to_the_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await collectLessonPayment('lesson-1', 'barn-1', null)

    expect(mockRpc).toHaveBeenCalledWith('collect_lesson_payment',
      expect.objectContaining({ p_payment_type: null })
    )
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('rpc error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(collectLessonPayment('lesson-1', 'barn-1', 'cash')).rejects.toThrow('rpc error')
  })
})

describe('getLessonsByBarn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeLessonsChain(data: unknown[], error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockOrder }
  }

  // fallback for tables role_filtering's mocks reference that lessons.ts itself
  // no longer queries directly now that hydrateParticipants is mocked as a unit
  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, in: mockIn })
    return { select: mockSelect }
  }

  it('should_return_lessons_for_the_barn_ordered_by_lesson_at_desc', async () => {
    const { select, mockEq, mockOrder } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: false })
  })

  it('should_return_empty_array_when_no_lessons', async () => {
    const { select } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result).toEqual([])
  })

  it('should_pass_the_fetched_lessons_and_barn_id_to_hydrate_participants', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: makePaymentInfoRpc(),
    } as any)

    await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(hydrateParticipants).toHaveBeenCalledWith(expect.anything(), [lesson], 'barn-1')
  })

  it('should_return_whatever_hydrate_participants_resolves_to', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: makePaymentInfoRpc(),
    } as any)
    const hydrated = [createMockLessonWithDetails()]
    vi.mocked(hydrateParticipants).mockResolvedValueOnce(hydrated)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result).toEqual(hydrated)
  })

  it('should_overlay_payment_type_from_get_lesson_payment_info_rpc', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    const mockRpc = makePaymentInfoRpc([{ lesson_id: 'lesson-1', payment_type: 'venmo' }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: mockRpc,
    } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(mockRpc).toHaveBeenCalledWith('get_lesson_payment_info', { p_lesson_ids: ['lesson-1'], p_barn_id: 'barn-1' })
    expect(result[0].payment_type).toBe('venmo')
  })

  it('should_default_payment_type_to_null_when_rpc_has_no_matching_row', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: makePaymentInfoRpc([]),
    } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].payment_type).toBeNull()
  })

  it('should_not_call_the_payment_info_rpc_when_there_are_no_lessons', async () => {
    const { select } = makeLessonsChain([])
    const mockRpc = makePaymentInfoRpc()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: mockRpc,
    } as any)

    await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('should_throw_when_the_payment_info_rpc_returns_an_error', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: makePaymentInfoRpc([], new Error('rpc error')),
    } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('rpc error')
  })

  it('should_default_payment_type_to_null_when_rpc_data_is_null', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].payment_type).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error_on_lessons_fetch', async () => {
    const { select } = makeLessonsChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('db error')
  })

  describe('role_filtering', () => {
    function makeMembershipLookupChain(data: { id: string } | null, error: Error | null = null) {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
      const mockStatusEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockRoleEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
      const mockUserEq = vi.fn().mockReturnValue({ eq: mockRoleEq })
      const mockBarnEq = vi.fn().mockReturnValue({ eq: mockUserEq })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
      return { select: mockSelect }
    }

    function makeEnrollmentChain(data: unknown[], error: Error | null = null) {
      const mockRiderEq = vi.fn().mockResolvedValue({ data, error })
      const mockBarnEq = vi.fn().mockReturnValue({ eq: mockRiderEq })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
      return { select: mockSelect }
    }

    function makeRiderLessonsInChain(data: unknown[], error: Error | null = null) {
      const mockOrder = vi.fn().mockResolvedValue({ data, error })
      const mockBarnEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockIn = vi.fn().mockReturnValue({ eq: mockBarnEq })
      const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
      return { select: mockSelect, mockBarnEq }
    }

    it('should_filter_by_barn_id_for_trainer_role_with_no_instructor_filter', async () => {
      const { select, mockEq } = makeLessonsChain([])
      const fromFn = vi.fn().mockReturnValue({ select })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer')

      expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_order_by_lesson_at_descending_for_trainer_role_with_no_instructor_filter', async () => {
      const { select, mockOrder } = makeLessonsChain([])
      const fromFn = vi.fn().mockReturnValue({ select })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer')

      expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: false })
    })

    it('should_not_query_barn_memberships_for_trainer_role_with_no_instructor_filter', async () => {
      const { select } = makeLessonsChain([])
      const fromFn = vi.fn().mockReturnValue({ select })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer')

      expect(fromFn).not.toHaveBeenCalledWith('barn_memberships')
    })

    it('should_return_one_lesson_for_rider_role', async () => {
      const lesson = createMockLesson({ instructor_id: null })
      let lessonRidersCallCount = 0
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') {
          lessonRidersCallCount++
          if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
          return makeInChain([])
        }
        if (table === 'lessons') return makeRiderLessonsInChain([lesson])
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn, rpc: makePaymentInfoRpc() } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toHaveLength(1)
    })

    it('should_return_correct_lesson_id_for_rider_role', async () => {
      const lesson = createMockLesson({ instructor_id: null })
      let lessonRidersCallCount = 0
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') {
          lessonRidersCallCount++
          if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
          return makeInChain([])
        }
        if (table === 'lessons') return makeRiderLessonsInChain([lesson])
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn, rpc: makePaymentInfoRpc() } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result[0].id).toBe(lesson.id)
    })

    it('should_return_empty_when_rider_lessons_data_is_null', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([{ lesson_id: 'lesson-1' }])
        if (table === 'lessons') return makeRiderLessonsInChain(null as any)
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toEqual([])
    })

    it('should_filter_rider_lessons_by_barn_id', async () => {
      const { select: lessonsSelect, mockBarnEq } = makeRiderLessonsInChain([])
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([{ lesson_id: 'lesson-1' }])
        if (table === 'lessons') return { select: lessonsSelect }
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_return_empty_when_no_rider_row_found_for_rider_role', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain(null)
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toEqual([])
    })

    it('should_return_empty_when_rider_has_no_enrollments', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([])
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toEqual([])
    })

    it('should_throw_when_rider_lookup_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain(null, new Error('rider error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider')).rejects.toThrow('rider error')
    })

    it('should_throw_when_enrollment_lookup_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([], new Error('enrollment error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider')).rejects.toThrow('enrollment error')
    })

    it('should_throw_when_rider_lessons_fetch_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([{ lesson_id: 'lesson-1' }])
        if (table === 'lessons') return makeRiderLessonsInChain([], new Error('lessons error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider')).rejects.toThrow('lessons error')
    })

    it('should_include_lessons_for_rider_role_when_their_own_participation_is_cancelled', async () => {
      // Regression lock-in: getRiderEnrolledLessonIds applies no cancelled_at filter,
      // so a rider's cancelled participation must still surface in their lesson list.
      const lesson = createMockLesson({ instructor_id: null })
      let lessonRidersCallCount = 0
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') {
          lessonRidersCallCount++
          if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id, cancelled_at: '2026-06-01T00:00:00Z' }])
          return makeInChain([])
        }
        if (table === 'lessons') return makeRiderLessonsInChain([lesson])
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn, rpc: makePaymentInfoRpc() } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toHaveLength(1)
    })
  })
})

describe('getLessonById', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(getMembershipByIdForBarn).mockReset()
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(null)
    vi.mocked(getProfileById).mockReset()
    vi.mocked(getProfileById).mockResolvedValue(null)
  })

  const rawLessonData = {
    ...createMockLesson({ instructor_id: 'mem-instructor-1' }),
    lesson_horses: [{ exertion_level: 3, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
    lesson_riders: [{ rider_id: 'mem-rider-1', barn_memberships: { user_id: null } }],
  }

  function makeLessonByIdChain(data: unknown, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect, mockEq1, mockEq2, mockMaybeSingle }
  }

  function mockLessonsFrom(
    data: unknown,
    error: Error | null = null,
    paymentRows: { lesson_id: string; payment_type: string | null }[] = []
  ) {
    const { select, mockEq1, mockEq2 } = makeLessonByIdChain(data, error)
    const from = vi.fn().mockReturnValue({ select })
    const rpc = makePaymentInfoRpc(paymentRows)
    vi.mocked(createClient).mockResolvedValue({ from, rpc } as any)
    return { from, select, mockEq1, mockEq2, rpc }
  }

  it('should_return_lesson_with_instructor_name', async () => {
    mockLessonsFrom(rawLessonData)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue({ user_id: 'user-instructor-1', profile_id: 'profile-1' } as any)
    vi.mocked(getProfileById).mockResolvedValue({ first_name: 'Jane', last_name: 'Smith' } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_name).toBe('Jane Smith')
  })

  it('should_fallback_to_instructor_id_as_name_when_instructor_has_no_profile', async () => {
    mockLessonsFrom(rawLessonData)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue({ user_id: 'user-instructor-1', profile_id: 'profile-1' } as any)
    vi.mocked(getProfileById).mockResolvedValue(null)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_name).toBe('mem-instructor-1')
  })

  it('should_call_resolve_member_names_with_only_rider_membership_ids', async () => {
    // Instructor resolution no longer flows through resolveMemberNames — it's resolved via
    // getMembershipByIdForBarn + getProfileById instead, so a rider caller viewing a lesson
    // taught by an instructor they can't otherwise see doesn't trigger the
    // get_active_barn_member_summaries RPC fallback twice for the same instructor. #845 follow-up.
    mockLessonsFrom(rawLessonData)

    await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-rider-1'], 'barn-1', expect.anything())
  })

  it('should_return_instructor_user_id', async () => {
    mockLessonsFrom(rawLessonData)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue({ user_id: 'user-instructor-1' } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_user_id).toBe('user-instructor-1')
  })

  it('should_resolve_instructor_user_id_via_get_membership_by_id_for_barn_even_for_rider_role', async () => {
    // The instructor's own barn_memberships row is invisible to a rider caller under RLS
    // (only barn_memberships_read_own applies), so instructor_user_id can no longer come
    // from a nested embed — getMembershipByIdForBarn does a direct-query + RPC fallback
    // that works for any caller. Regression test for #845.
    mockLessonsFrom(rawLessonData)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue({ user_id: 'user-instructor-1' } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'rider-membership-1')

    expect(result?.instructor_user_id).toBe('user-instructor-1')
  })

  it('should_call_get_membership_by_id_for_barn_with_instructor_id_and_barn_id', async () => {
    mockLessonsFrom(rawLessonData)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue({ user_id: 'user-instructor-1' } as any)

    await getLessonById('lesson-1', 'barn-1', 'rider', 'rider-membership-1')

    expect(getMembershipByIdForBarn).toHaveBeenCalledWith('mem-instructor-1', 'barn-1', expect.anything())
  })

  it('should_return_null_instructor_user_id_for_a_stub_trainer', async () => {
    mockLessonsFrom(rawLessonData)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue({ user_id: null } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_user_id).toBeNull()
  })

  it('should_return_null_instructor_name_when_instructor_id_is_null', async () => {
    mockLessonsFrom({ ...rawLessonData, instructor_id: null })

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_name).toBeNull()
  })

  it('should_return_null_instructor_user_id_when_instructor_id_is_null', async () => {
    mockLessonsFrom({ ...rawLessonData, instructor_id: null })

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_user_id).toBeNull()
  })

  it('should_not_call_get_membership_by_id_for_barn_when_instructor_id_is_null', async () => {
    mockLessonsFrom({ ...rawLessonData, instructor_id: null })

    await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(getMembershipByIdForBarn).not.toHaveBeenCalled()
  })

  it('should_return_null_instructor_name_when_instructor_membership_not_found', async () => {
    mockLessonsFrom(rawLessonData)
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(null)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_name).toBeNull()
  })

  it('should_propagate_error_when_resolve_member_names_rejects', async () => {
    mockLessonsFrom(rawLessonData)
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('member names error'))

    await expect(getLessonById('lesson-1', 'barn-1', 'trainer')).rejects.toThrow('member names error')
  })

  it('should_return_all_riders_for_group_lesson', async () => {
    const groupLessonData = {
      ...createMockLesson({ lesson_type: 'group', instructor_id: null }),
      lesson_horses: [{ exertion_level: 3, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
      lesson_riders: [
        { rider_id: 'mem-1', barn_memberships: { user_id: null } },
        { rider_id: 'mem-2', barn_memberships: { user_id: null } },
      ],
    }
    mockLessonsFrom(groupLessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders).toHaveLength(2)
  })

  it('should_query_by_lesson_id_and_barn_id', async () => {
    const { mockEq1, mockEq2 } = mockLessonsFrom({ ...rawLessonData, instructor_id: null })

    await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(mockEq1).toHaveBeenCalledWith('id', 'lesson-1')
    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_return_null_when_lesson_not_found', async () => {
    mockLessonsFrom(null)

    const result = await getLessonById('nonexistent', 'barn-1', 'trainer')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    mockLessonsFrom(null, new Error('db error'))

    await expect(getLessonById('lesson-1', 'barn-1', 'trainer')).rejects.toThrow('db error')
  })

  it('should_include_jumping_true_in_result', async () => {
    const jumpingData = {
      ...createMockLesson({ jumping: true, instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [],
    }
    mockLessonsFrom(jumpingData)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.jumping).toBe(true)
  })

  it('should_select_rider_id_regardless_of_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = mockLessonsFrom(noInstructorData)

    await getLessonById('lesson-1', 'barn-1', 'rider')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('rider_id'))
  })

  it('should_select_private_notes_for_trainer_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = mockLessonsFrom(noInstructorData)

    await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('private_notes'))
  })

  it('should_select_private_notes_for_manager_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = mockLessonsFrom(noInstructorData)

    await getLessonById('lesson-1', 'barn-1', 'manager')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('private_notes'))
  })

  it('should_not_select_private_notes_for_rider_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = mockLessonsFrom(noInstructorData)

    await getLessonById('lesson-1', 'barn-1', 'rider')

    expect(select).not.toHaveBeenCalledWith(expect.stringContaining('private_notes'))
  })

  it('should_select_cancelled_at_for_rider_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = mockLessonsFrom(noInstructorData)

    await getLessonById('lesson-1', 'barn-1', 'rider')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('cancelled_at'))
  })

  it('should_select_cancelled_at_for_manager_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = mockLessonsFrom(noInstructorData)

    await getLessonById('lesson-1', 'barn-1', 'manager')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('cancelled_at'))
  })

  it('should_map_cancelled_at_onto_normalized_lesson_rider', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: null, cancelled_at: '2026-06-01T00:00:00Z', barn_memberships: { user_id: null } }],
    }
    mockLessonsFrom(lessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].cancelled_at).toBe('2026-06-01T00:00:00Z')
  })

  it('should_default_cancelled_at_to_null_when_absent_on_normalized_lesson_rider', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: null, barn_memberships: { user_id: null } }],
    }
    mockLessonsFrom(lessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].cancelled_at).toBeNull()
  })

  it('should_set_private_notes_to_null_for_rider_role', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: 'good position', barn_memberships: { user_id: 'user-1' } }],
    }
    mockLessonsFrom(riderLessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider')

    expect(result?.lesson_riders[0].private_notes).toBeNull()
  })

  it('should_preserve_rider_notes_for_self_when_role_is_rider', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: 'good position', barn_memberships: { user_id: 'user-1' } }],
    }
    mockLessonsFrom(riderLessonData)

    // Anchored to the caller's own membership ID (mem-1), not the embed-sourced user_id.
    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'mem-1')

    expect(result?.lesson_riders[0].rider_notes).toBe('good position')
  })

  it('should_preserve_rider_notes_for_self_even_when_own_barn_memberships_embed_is_null', async () => {
    // Masking no longer depends on barn_memberships_read_own returning the caller's own
    // embed — it's anchored to rider_id (always present) instead. Regression test for #845.
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: 'good position', barn_memberships: null }],
    }
    mockLessonsFrom(riderLessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'mem-1')

    expect(result?.lesson_riders[0].rider_notes).toBe('good position')
  })

  it('should_null_rider_notes_for_non_self_riders_when_role_is_rider', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [
        { rider_id: 'mem-1', rider_notes: 'good position', barn_memberships: { user_id: 'user-1' } },
        { rider_id: 'mem-2', rider_notes: 'needs work', barn_memberships: { user_id: 'user-2' } },
      ],
    }
    mockLessonsFrom(riderLessonData)

    // Anchored to the caller's own membership ID (mem-1), not the embed-sourced user_id.
    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'mem-1')

    expect(result?.lesson_riders[1].rider_notes).toBeNull()
  })

  it('should_map_cancellation_notes_onto_normalized_lesson_rider', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: null, cancellation_notes: 'Rider called in sick', barn_memberships: { user_id: null } }],
    }
    mockLessonsFrom(lessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].cancellation_notes).toBe('Rider called in sick')
  })

  it('should_default_cancellation_notes_to_null_when_absent_on_normalized_lesson_rider', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: null, barn_memberships: { user_id: null } }],
    }
    mockLessonsFrom(lessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].cancellation_notes).toBeNull()
  })

  it('should_preserve_cancellation_notes_for_self_when_role_is_rider', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: null, cancellation_notes: 'called in sick', barn_memberships: { user_id: 'user-1' } }],
    }
    mockLessonsFrom(riderLessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'user-1')

    expect(result?.lesson_riders[0].cancellation_notes).toBe('called in sick')
  })

  it('should_preserve_cancellation_notes_for_non_self_riders_when_role_is_rider', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [
        { rider_id: 'mem-1', rider_notes: null, cancellation_notes: 'called in sick', barn_memberships: { user_id: 'user-1' } },
        { rider_id: 'mem-2', rider_notes: null, cancellation_notes: 'family emergency', barn_memberships: { user_id: 'user-2' } },
      ],
    }
    mockLessonsFrom(riderLessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'user-1')

    expect(result?.lesson_riders[1].cancellation_notes).toBe('family emergency')
  })

  it('should_fallback_to_membership_id_as_name_when_membership_map_has_no_entry', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', barn_memberships: { user_id: null } }],
    }
    mockLessonsFrom(lessonData)
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].barn_membership?.name).toBe('mem-1')
  })

  it('should_resolve_co_rider_via_rider_id_even_when_barn_memberships_embed_is_null', async () => {
    // A rider caller has no RLS visibility into another rider's barn_memberships row, so
    // PostgREST returns a null embed for co-riders on a group lesson. rider_id (a plain
    // column, not subject to that nested-embed RLS check) must still resolve the co-rider's
    // identity via resolveMemberNames. Regression test for #845.
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-2', rider_notes: null, barn_memberships: null }],
    }
    mockLessonsFrom(lessonData)
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-2', 'Riley Rider']]))

    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'user-1')

    expect(result?.lesson_riders[0].barn_membership).toEqual({ id: 'mem-2', user_id: null, name: 'Riley Rider' })
  })

  it('should_resolve_rider_name_via_resolve_member_names', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_id: 'mem-1', rider_notes: null, barn_memberships: { user_id: 'rider-user-1' } }],
    }
    mockLessonsFrom(lessonData)
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].barn_membership?.name).toBe('Alice Rider')
  })

  it('should_overlay_payment_type_from_get_lesson_payment_info_rpc', async () => {
    const { rpc } = mockLessonsFrom(rawLessonData, null, [{ lesson_id: 'lesson-1', payment_type: 'zelle' }])

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(rpc).toHaveBeenCalledWith('get_lesson_payment_info', { p_lesson_ids: ['lesson-1'], p_barn_id: 'barn-1' })
    expect(result?.payment_type).toBe('zelle')
  })

  it('should_default_payment_type_to_null_when_rpc_has_no_matching_row', async () => {
    mockLessonsFrom(rawLessonData)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.payment_type).toBeNull()
  })

  it('should_not_call_the_payment_info_rpc_when_lesson_is_not_found', async () => {
    const { rpc } = mockLessonsFrom(null)

    await getLessonById('nonexistent', 'barn-1', 'trainer')

    expect(rpc).not.toHaveBeenCalled()
  })
})


describe('getUpcomingLessons', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const from = '2026-06-02T00:00:00.000Z'
  const to = '2026-06-09T00:00:00.000Z'

  // manager/trainer path: select → eq(barn_id) → eq(instructor_id) → gte → lt → order
  function makeInstructorLessonsChain(data: unknown[], error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockInstructorEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockInstructorEq })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
    return { select: mockSelect, mockBarnEq, mockInstructorEq, mockGte, mockLt, mockOrder }
  }

  // rider path: lessons query uses .in(id) instead of second .eq
  function makeRiderLessonsChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockIn = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect, mockIn, mockGte, mockLt, mockOrder }
  }

  // membership lookup: select → eq(barn_id) → eq(user_id) → eq(role) → eq(status) → maybeSingle
  function makeMembershipLookupChain(data: { id: string } | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockStatusEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockRoleEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
    const mockUserEq = vi.fn().mockReturnValue({ eq: mockRoleEq })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockUserEq })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
    return { select: mockSelect }
  }

  // lesson_riders enrollment lookup: select → eq(barn_id) → eq(rider_id) → resolves
  function makeEnrollmentChain(data: unknown[], error: Error | null = null) {
    const mockRiderEq = vi.fn().mockResolvedValue({ data, error })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockRiderEq })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
    return { select: mockSelect, mockBarnEq, mockRiderEq }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, in: mockIn })
    return { select: mockSelect }
  }

  // getUserMembership shape: select('*').eq('user_id', ...).eq('barn_id', ...).maybeSingle()
  function makeCallerMembershipChain(data: { id: string } | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockBarnEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockUserEq = vi.fn().mockReturnValue({ eq: mockBarnEq })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockUserEq })
    return { select: mockSelect }
  }

  function fromWithCallerMembership(lessonsSelect: ReturnType<typeof vi.fn>, callerMembershipId = 'caller-membership-1') {
    const { select: membershipSelect } = makeCallerMembershipChain({ id: callerMembershipId })
    return vi.fn().mockImplementation((table: string) =>
      table === 'barn_memberships' ? { select: membershipSelect } : { select: lessonsSelect }
    )
  }

  it('should_filter_by_barn_id', async () => {
    const { select, mockBarnEq } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_from_date', async () => {
    const { select, mockGte } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockGte).toHaveBeenCalledWith('lesson_at', from)
  })

  it('should_filter_by_to_date', async () => {
    const { select, mockLt } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockLt).toHaveBeenCalledWith('lesson_at', to)
  })

  it('should_order_by_lesson_at_ascending', async () => {
    const { select, mockOrder } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
  })

  it('should_filter_by_instructor_id_using_callers_own_membership_id_for_manager_role', async () => {
    const { select, mockInstructorEq } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select, 'manager-membership-1') } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockInstructorEq).toHaveBeenCalledWith('instructor_id', 'manager-membership-1')
  })

  it('should_filter_by_instructor_id_using_callers_own_membership_id_for_trainer_role', async () => {
    const { select, mockInstructorEq } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select, 'trainer-membership-1') } as any)

    await getUpcomingLessons('barn-1', from, to, 'trainer-1', 'trainer')

    expect(mockInstructorEq).toHaveBeenCalledWith('instructor_id', 'trainer-membership-1')
  })

  it('should_return_empty_when_caller_has_no_membership_for_manager_role', async () => {
    const { select: membershipSelect } = makeCallerMembershipChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: membershipSelect }),
    } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result).toEqual([])
  })

  it('should_filter_enrollment_by_barn_id', async () => {
    const chain = makeEnrollmentChain([])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') return chain
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(chain.mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_return_empty_when_no_rider_row_found_for_user', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result).toEqual([])
  })

  it('should_return_empty_when_rider_has_no_lesson_enrollments', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') return makeEnrollmentChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result).toEqual([])
  })

  it('should_return_one_lesson_for_rider_role', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    let lessonRidersCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') {
        lessonRidersCallCount++
        if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
        return makeInChain([])
      }
      if (table === 'lessons') return makeRiderLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result).toHaveLength(1)
  })

  it('should_return_correct_lesson_id_for_rider_role', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    let lessonRidersCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') {
        lessonRidersCallCount++
        if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
        return makeInChain([])
      }
      if (table === 'lessons') return makeRiderLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result[0].id).toBe(lesson.id)
  })

  it('should_throw_when_rider_lookup_returns_an_error', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain(null, new Error('rider lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')).rejects.toThrow('rider lookup error')
  })

  it('should_throw_when_enrollment_lookup_returns_an_error', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') return makeEnrollmentChain([], new Error('enrollment error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')).rejects.toThrow('enrollment error')
  })

  it('should_throw_when_rider_lessons_fetch_returns_an_error', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') return makeEnrollmentChain([{ lesson_id: 'lesson-1' }])
      if (table === 'lessons') return makeRiderLessonsChain([], new Error('lessons error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')).rejects.toThrow('lessons error')
  })

  it('should_return_empty_when_rider_lessons_data_is_null', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') return makeEnrollmentChain([{ lesson_id: 'lesson-1' }])
      if (table === 'lessons') return makeRiderLessonsChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_no_lessons_in_range', async () => {
    const { select } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result).toEqual([])
  })

  it('should_pass_the_fetched_lessons_and_barn_id_to_hydrate_participants', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const { select } = makeInstructorLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(hydrateParticipants).toHaveBeenCalledWith(expect.anything(), [lesson], 'barn-1')
  })

  it('should_return_whatever_hydrate_participants_resolves_to', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const { select } = makeInstructorLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)
    const hydrated = [createMockLessonWithDetails()]
    vi.mocked(hydrateParticipants).mockResolvedValueOnce(hydrated)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result).toBe(hydrated)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeInstructorLessonsChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('db error')
  })
})

describe('updateLesson', () => {
  function makeUpdateChain(data: unknown, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { mockUpdate, mockEq1, mockEq2, mockSelect, mockSingle }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_call_update_with_the_provided_fields', async () => {
    const updated = createMockLesson({ fee: 90 })
    const { mockUpdate } = makeUpdateChain(updated)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateLesson('lesson-1', 'barn-1', { fee: 90 })

    expect(mockUpdate).toHaveBeenCalledWith({ fee: 90 })
  })

  it('should_return_the_updated_lesson', async () => {
    const updated = createMockLesson({ fee: 90 })
    const { mockUpdate } = makeUpdateChain(updated)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    const result = await updateLesson('lesson-1', 'barn-1', { fee: 90 })

    expect(result).toEqual(updated)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { mockUpdate } = makeUpdateChain(null, new Error('rls denied'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await expect(updateLesson('lesson-1', 'barn-1', { fee: 90 })).rejects.toThrow('rls denied')
  })

  it('should_throw_when_no_row_is_returned', async () => {
    const { mockUpdate } = makeUpdateChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await expect(updateLesson('lesson-1', 'barn-1', { fee: 90 })).rejects.toThrow('lesson not found')
  })

  it('should_throw_when_trainer_is_denied_by_rls', async () => {
    const { mockUpdate } = makeUpdateChain(null, new Error('new row violates row-level security policy'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await expect(updateLesson('lesson-1', 'barn-1', { fee: 90 })).rejects.toThrow('row-level security policy')
  })

  it('should_throw_when_rider_is_denied_by_rls', async () => {
    const { mockUpdate } = makeUpdateChain(null, new Error('new row violates row-level security policy'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await expect(updateLesson('lesson-1', 'barn-1', { fee: 90 })).rejects.toThrow('row-level security policy')
  })
})

