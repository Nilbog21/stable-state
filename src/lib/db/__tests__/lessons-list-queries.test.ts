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
import {
  getLessonsByBarn,
  getLessonsByIds,
} from '../lessons'

const mockLesson = createMockLesson({ fee: 75, lesson_at: '2026-05-16T10:00:00Z', submitted_at: '2026-05-16T10:05:00Z' })

function makePaymentInfoRpc(rows: { lesson_id: string; payment_type: string | null }[] = [], error: Error | null = null) {
  return vi.fn().mockResolvedValue({ data: rows, error })
}

// hydrateParticipants is exercised directly in lesson-participants-hydrate.test.ts;
// here it's mocked as a single unit that passes lessons through unchanged by default.
beforeEach(() => {
  vi.mocked(hydrateParticipants).mockImplementation(async (_supabase, lessons) =>
    lessons as unknown as ReturnType<typeof createMockLessonWithDetails>[]
  )
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

    await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: false })
  })

  it('should_return_empty_array_when_no_lessons', async () => {
    const { select } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_pass_the_fetched_lessons_and_barn_id_to_hydrate_participants', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: makePaymentInfoRpc(),
    } as any)

    await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(hydrateParticipants).toHaveBeenCalledWith(expect.anything(), [lesson], 'barn-1', 'America/New_York')
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

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(result).toEqual(hydrated)
  })

  it('should_call_payment_info_rpc_with_lesson_ids_and_barn_id', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    const mockRpc = makePaymentInfoRpc([{ lesson_id: 'lesson-1', payment_type: 'venmo' }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: mockRpc,
    } as any)

    await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(mockRpc).toHaveBeenCalledWith('get_lesson_payment_info', { p_lesson_ids: ['lesson-1'], p_barn_id: 'barn-1' })
  })

  it('should_overlay_payment_type_from_get_lesson_payment_info_rpc', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: makePaymentInfoRpc([{ lesson_id: 'lesson-1', payment_type: 'venmo' }]),
    } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(result[0].payment_type).toBe('venmo')
  })

  it('should_default_payment_type_to_null_when_rpc_has_no_matching_row', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: makePaymentInfoRpc([]),
    } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(result[0].payment_type).toBeNull()
  })

  it('should_not_call_the_payment_info_rpc_when_there_are_no_lessons', async () => {
    const { select } = makeLessonsChain([])
    const mockRpc = makePaymentInfoRpc()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: mockRpc,
    } as any)

    await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('should_throw_when_the_payment_info_rpc_returns_an_error', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: makePaymentInfoRpc([], new Error('rpc error')),
    } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')).rejects.toThrow('rpc error')
  })

  it('should_default_payment_type_to_null_when_rpc_data_is_null', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', instructor_id: null })
    const { select } = makeLessonsChain([lesson])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')

    expect(result[0].payment_type).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error_on_lessons_fetch', async () => {
    const { select } = makeLessonsChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager', 'America/New_York')).rejects.toThrow('db error')
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

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer', 'America/New_York')

      expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_order_by_lesson_at_descending_for_trainer_role_with_no_instructor_filter', async () => {
      const { select, mockOrder } = makeLessonsChain([])
      const fromFn = vi.fn().mockReturnValue({ select })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer', 'America/New_York')

      expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: false })
    })

    it('should_not_query_barn_memberships_for_trainer_role_with_no_instructor_filter', async () => {
      const { select } = makeLessonsChain([])
      const fromFn = vi.fn().mockReturnValue({ select })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer', 'America/New_York')

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

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')

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

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')

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

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')

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

      await getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')

      expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_return_empty_when_no_rider_row_found_for_rider_role', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain(null)
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')

      expect(result).toEqual([])
    })

    it('should_return_empty_when_rider_has_no_enrollments', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([])
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')

      expect(result).toEqual([])
    })

    it('should_throw_when_rider_lookup_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain(null, new Error('rider error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')).rejects.toThrow('rider error')
    })

    it('should_throw_when_enrollment_lookup_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([], new Error('enrollment error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')).rejects.toThrow('enrollment error')
    })

    it('should_throw_when_rider_lessons_fetch_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([{ lesson_id: 'lesson-1' }])
        if (table === 'lessons') return makeRiderLessonsInChain([], new Error('lessons error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')).rejects.toThrow('lessons error')
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

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider', 'America/New_York')

      expect(result).toHaveLength(1)
    })
  })
})

describe('getLessonsByIds', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeLessonsChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIn }
  }

  it('should_return_empty_array_without_querying_when_ids_is_empty', async () => {
    const result = await getLessonsByIds('barn-1', [], 'America/New_York')

    expect(result).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_scope_the_query_to_barn_id', async () => {
    const { select, mockEq } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getLessonsByIds('barn-1', ['lesson-1'], 'America/New_York')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_the_provided_ids', async () => {
    const { select, mockIn } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getLessonsByIds('barn-1', ['lesson-1', 'lesson-2'], 'America/New_York')

    expect(mockIn).toHaveBeenCalledWith('id', ['lesson-1', 'lesson-2'])
  })

  it('should_hydrate_participants_for_the_returned_lessons', async () => {
    const { select } = makeLessonsChain([mockLesson])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)
    const hydrated = [createMockLessonWithDetails({ id: mockLesson.id })]
    vi.mocked(hydrateParticipants).mockResolvedValue(hydrated as any)

    const result = await getLessonsByIds('barn-1', [mockLesson.id], 'America/New_York')

    expect(result).toEqual(hydrated)
  })

  it('should_treat_null_data_as_empty', async () => {
    const { select } = makeLessonsChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getLessonsByIds('barn-1', ['lesson-1'], 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeLessonsChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getLessonsByIds('barn-1', ['lesson-1'], 'America/New_York')).rejects.toThrow('db error')
  })
})

