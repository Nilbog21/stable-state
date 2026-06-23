import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  createLesson,
  deleteLesson,
  getLessonsByBarn,
  getLessonById,
  getUpcomingLessons,
  updateLesson,
} from '../lessons'

const mockLesson = createMockLesson({ fee: 75, lesson_at: '2026-05-16T10:00:00Z', submitted_at: '2026-05-16T10:05:00Z' })

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

describe('deleteLesson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_delete_lesson_by_id_and_barn_id', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ delete: mockDelete }),
    } as any)

    await deleteLesson('lesson-1', 'barn-1')

    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq1).toHaveBeenCalledWith('id', 'lesson-1')
    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: new Error('db error') })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ delete: mockDelete }),
    } as any)

    await expect(deleteLesson('lesson-1', 'barn-1')).rejects.toThrow('db error')
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

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
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

  it('should_return_lessons_with_instructor_name_horse_names_and_rider_names', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'riders') return makeInChain([{ id: 'rider-1', name: 'Alice' }])
      if (table === 'profiles') return makeInChain([{ user_id: 'user-1', first_name: 'John', last_name: 'Doe' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result).toEqual([{
      ...lesson,
      instructor_name: 'John Doe',
      horse_names: ['Thunderbolt'],
      rider_names: ['Alice'],
      rider_count: 1,
      horse_count: 1,
    }])
  })

  it('should_return_all_rider_names_for_group_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'rider-1' },
        { lesson_id: lesson.id, rider_id: 'rider-2' },
      ])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'riders') return makeInChain([
        { id: 'rider-1', name: 'Alice' },
        { id: 'rider-2', name: 'Bob' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].rider_names).toEqual(['Alice', 'Bob'])
    expect(result[0].rider_count).toBe(2)
  })

  it('should_return_horse_count', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson.id, horse_id: 'horse-1' },
        { lesson_id: lesson.id, horse_id: 'horse-2' },
      ])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].horse_count).toBe(2)
  })

  it('should_return_null_instructor_name_when_no_profile_exists', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'riders') return makeInChain([{ id: 'rider-1', name: 'Alice' }])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_return_empty_horse_names_when_no_lesson_horses', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].horse_names).toEqual([])
  })

  it('should_include_lesson_type_in_results', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].lesson_type).toBe('normal')
  })

  it('should_include_jumping_in_results', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].jumping).toBe(false)
  })

  it('should_include_jumping_true_in_results', async () => {
    const lesson = createMockLesson({ instructor_id: null, jumping: true })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].jumping).toBe(true)
  })

  function mockClientWithLesson(lesson: ReturnType<typeof createMockLesson>) {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
  }

  it('should_include_payment_type_in_results', async () => {
    mockClientWithLesson(createMockLesson({ instructor_id: null }))

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].payment_type).toBeNull()
  })

  it('should_pass_through_non_null_payment_type', async () => {
    mockClientWithLesson(createMockLesson({ instructor_id: null, payment_type: 'venmo' }))

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].payment_type).toBe('venmo')
  })

  it('should_throw_when_supabase_returns_an_error_on_lessons_fetch', async () => {
    const { select } = makeLessonsChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('db error')
  })

  it('should_throw_when_lesson_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([], new Error('horses error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('horses error')
  })

  it('should_throw_when_lesson_riders_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([], new Error('riders error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('riders error')
  })

  it('should_throw_when_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain([], new Error('horse lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('horse lookup error')
  })

  it('should_throw_when_riders_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'horses') return makeInChain([])
      if (table === 'riders') return makeInChain([], new Error('rider lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('rider lookup error')
  })

  it('should_throw_when_profiles_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([], new Error('profiles error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('profiles error')
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain(null)
      if (table === 'lesson_riders') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].horse_names).toEqual([])
  })

  it('should_treat_null_lesson_riders_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].rider_names).toEqual([])
    expect(result[0].rider_count).toBe(0)
  })

  it('should_treat_null_profiles_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_treat_null_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].horse_names).toEqual([])
  })

  it('should_return_empty_rider_names_when_riders_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].rider_names).toEqual([])
    expect(result[0].rider_count).toBe(1)
  })

  describe('role_filtering', () => {
    function makeTrainerLessonsChain(data: unknown[], error: Error | null = null) {
      const mockOrder = vi.fn().mockResolvedValue({ data, error })
      const mockInstructorEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockBarnEq = vi.fn().mockReturnValue({ eq: mockInstructorEq })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
      return { select: mockSelect, mockBarnEq, mockInstructorEq, mockOrder }
    }

    function makeRiderLookupChain(data: { id: string } | null, error: Error | null = null) {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
      const mockUserEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
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

    it('should_filter_by_barn_id_for_trainer_role', async () => {
      const { select, mockBarnEq } = makeTrainerLessonsChain([])
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({ select }),
      } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer')

      expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_filter_by_instructor_id_for_trainer_role', async () => {
      const { select, mockInstructorEq } = makeTrainerLessonsChain([])
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({ select }),
      } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer')

      expect(mockInstructorEq).toHaveBeenCalledWith('instructor_id', 'trainer-1')
    })

    it('should_return_one_lesson_for_rider_role', async () => {
      const lesson = createMockLesson({ instructor_id: null })
      let lessonRidersCallCount = 0
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') {
          lessonRidersCallCount++
          if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
          return makeInChain([])
        }
        if (table === 'lessons') return makeRiderLessonsInChain([lesson])
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toHaveLength(1)
    })

    it('should_return_correct_lesson_id_for_rider_role', async () => {
      const lesson = createMockLesson({ instructor_id: null })
      let lessonRidersCallCount = 0
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') {
          lessonRidersCallCount++
          if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
          return makeInChain([])
        }
        if (table === 'lessons') return makeRiderLessonsInChain([lesson])
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result[0].id).toBe(lesson.id)
    })

    it('should_return_empty_when_rider_lessons_data_is_null', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
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
        if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
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
        if (table === 'riders') return makeRiderLookupChain(null)
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toEqual([])
    })

    it('should_return_empty_when_rider_has_no_enrollments', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([])
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toEqual([])
    })

    it('should_throw_when_rider_lookup_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'riders') return makeRiderLookupChain(null, new Error('rider error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider')).rejects.toThrow('rider error')
    })

    it('should_throw_when_enrollment_lookup_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([], new Error('enrollment error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider')).rejects.toThrow('enrollment error')
    })

    it('should_throw_when_rider_lessons_fetch_returns_error', async () => {
      const fromFn = vi.fn().mockImplementation((table: string) => {
        if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
        if (table === 'lesson_riders') return makeEnrollmentChain([{ lesson_id: 'lesson-1' }])
        if (table === 'lessons') return makeRiderLessonsInChain([], new Error('lessons error'))
        return makeInChain([])
      })
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await expect(getLessonsByBarn('barn-1', 'user-1', 'rider')).rejects.toThrow('lessons error')
    })
  })
})

describe('getLessonById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const rawLessonData = {
    ...createMockLesson(),
    lesson_horses: [{ exertion_level: 3, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
    lesson_riders: [{ riders: { id: 'rider-1', name: 'Alice' } }],
  }

  function makeLessonByIdChain(data: unknown, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect, mockEq1, mockEq2, mockMaybeSingle }
  }

  function makeProfileChain(data: unknown, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeFrom(lessonData: unknown, profileData: unknown = null, lessonError: Error | null = null, profileError: Error | null = null) {
    const lessonChain = makeLessonByIdChain(lessonData, lessonError)
    const profileChain = makeProfileChain(profileData, profileError)
    return vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return { select: lessonChain.select }
      if (table === 'profiles') return profileChain
      return makeProfileChain(null)
    })
  }

  it('should_return_lesson_with_instructor_name', async () => {
    const from = makeFrom(rawLessonData, { first_name: 'Jane', last_name: 'Smith' })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1')

    expect(result?.instructor_name).toBe('Jane Smith')
  })

  it('should_return_null_instructor_name_when_instructor_id_is_null', async () => {
    const lessonWithoutInstructor = { ...rawLessonData, instructor_id: null }
    const { select } = makeLessonByIdChain(lessonWithoutInstructor)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1')

    expect(result?.instructor_name).toBeNull()
  })

  it('should_return_null_instructor_name_when_profile_not_found', async () => {
    const from = makeFrom(rawLessonData, null)
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1')

    expect(result?.instructor_name).toBeNull()
  })

  it('should_return_all_riders_for_group_lesson', async () => {
    const groupLessonData = {
      ...createMockLesson({ lesson_type: 'group', instructor_id: null }),
      lesson_horses: [{ exertion_level: 3, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
      lesson_riders: [
        { riders: { id: 'rider-1', name: 'Alice' } },
        { riders: { id: 'rider-2', name: 'Bob' } },
      ],
    }
    const { select } = makeLessonByIdChain(groupLessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1')

    expect(result?.lesson_riders).toHaveLength(2)
  })

  it('should_query_by_lesson_id_and_barn_id', async () => {
    const lessonDataNoInstructor = { ...rawLessonData, instructor_id: null }
    const { select, mockEq1, mockEq2 } = makeLessonByIdChain(lessonDataNoInstructor)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonById('lesson-1', 'barn-1')

    expect(mockEq1).toHaveBeenCalledWith('id', 'lesson-1')
    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_return_null_when_lesson_not_found', async () => {
    const { select } = makeLessonByIdChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('nonexistent', 'barn-1')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeLessonByIdChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getLessonById('lesson-1', 'barn-1')).rejects.toThrow('db error')
  })

  it('should_throw_when_profiles_query_returns_error', async () => {
    const from = makeFrom(rawLessonData, null, null, new Error('profiles error'))
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonById('lesson-1', 'barn-1')).rejects.toThrow('profiles error')
  })

  it('should_include_jumping_true_in_result', async () => {
    const jumpingData = {
      ...createMockLesson({ jumping: true, instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [],
    }
    const { select } = makeLessonByIdChain(jumpingData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1')

    expect(result?.jumping).toBe(true)
  })

  it('should_select_private_notes_for_trainer_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = makeLessonByIdChain(noInstructorData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('private_notes'))
  })

  it('should_select_private_notes_for_manager_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = makeLessonByIdChain(noInstructorData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonById('lesson-1', 'barn-1', 'manager')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('private_notes'))
  })

  it('should_not_select_private_notes_for_rider_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = makeLessonByIdChain(noInstructorData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonById('lesson-1', 'barn-1', 'rider')

    expect(select).not.toHaveBeenCalledWith(expect.stringContaining('private_notes'))
  })

  it('should_set_private_notes_to_null_for_rider_role', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: 'good position', riders: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
    }
    const { select } = makeLessonByIdChain(riderLessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider')

    expect(result?.lesson_riders[0].private_notes).toBeNull()
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
  function makeRiderLessonsChain(data: unknown[], error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockIn = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect, mockIn, mockGte, mockLt, mockOrder }
  }

  // rider lookup: select → eq(barn_id) → eq(user_id) → maybeSingle
  function makeRiderLookupChain(data: { id: string } | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockUserEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
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
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  it('should_filter_by_barn_id', async () => {
    const { select, mockBarnEq } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_from_date', async () => {
    const { select, mockGte } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockGte).toHaveBeenCalledWith('lesson_at', from)
  })

  it('should_filter_by_to_date', async () => {
    const { select, mockLt } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockLt).toHaveBeenCalledWith('lesson_at', to)
  })

  it('should_order_by_lesson_at_ascending', async () => {
    const { select, mockOrder } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
  })

  it('should_filter_by_instructor_id_for_manager_role', async () => {
    const { select, mockInstructorEq } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(mockInstructorEq).toHaveBeenCalledWith('instructor_id', 'user-1')
  })

  it('should_filter_by_instructor_id_for_trainer_role', async () => {
    const { select, mockInstructorEq } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getUpcomingLessons('barn-1', from, to, 'trainer-1', 'trainer')

    expect(mockInstructorEq).toHaveBeenCalledWith('instructor_id', 'trainer-1')
  })

  it('should_filter_enrollment_by_barn_id', async () => {
    const chain = makeEnrollmentChain([])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') return chain
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(chain.mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_return_empty_when_no_rider_row_found_for_user', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'riders') return makeRiderLookupChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result).toEqual([])
  })

  it('should_return_empty_when_rider_has_no_lesson_enrollments', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
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
      if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') {
        lessonRidersCallCount++
        if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
        return makeInChain([])
      }
      if (table === 'lessons') return makeRiderLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
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
      if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') {
        lessonRidersCallCount++
        if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
        return makeInChain([])
      }
      if (table === 'lessons') return makeRiderLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result[0].id).toBe(lesson.id)
  })

  it('should_throw_when_rider_lookup_returns_an_error', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'riders') return makeRiderLookupChain(null, new Error('rider lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')).rejects.toThrow('rider lookup error')
  })

  it('should_throw_when_enrollment_lookup_returns_an_error', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') return makeEnrollmentChain([], new Error('enrollment error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')).rejects.toThrow('enrollment error')
  })

  it('should_throw_when_rider_lessons_fetch_returns_an_error', async () => {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') return makeEnrollmentChain([{ lesson_id: 'lesson-1' }])
      if (table === 'lessons') return makeRiderLessonsChain([], new Error('lessons error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')).rejects.toThrow('lessons error')
  })

  it('should_return_empty_array_when_no_lessons_in_range', async () => {
    const { select } = makeInstructorLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result).toEqual([])
  })

  it('should_return_lessons_with_horse_names_and_rider_names', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const from2 = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'riders') return makeInChain([{ id: 'rider-1', name: 'Alice' }])
      if (table === 'profiles') return makeInChain([{ user_id: 'user-1', first_name: 'John', last_name: 'Doe' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: from2 } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result).toEqual([{
      ...lesson,
      instructor_name: 'John Doe',
      horse_names: ['Thunderbolt'],
      rider_names: ['Alice'],
      rider_count: 1,
      horse_count: 1,
    }])
  })

  it('should_return_all_rider_names_for_group_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'rider-1' },
        { lesson_id: lesson.id, rider_id: 'rider-2' },
      ])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'riders') return makeInChain([
        { id: 'rider-1', name: 'Alice' },
        { id: 'rider-2', name: 'Bob' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_names).toEqual(['Alice', 'Bob'])
  })

  it('should_return_rider_count_for_group_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'rider-1' },
        { lesson_id: lesson.id, rider_id: 'rider-2' },
      ])
      if (table === 'riders') return makeInChain([
        { id: 'rider-1', name: 'Alice' },
        { id: 'rider-2', name: 'Bob' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_count).toBe(2)
  })

  it('should_return_horse_count', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson.id, horse_id: 'horse-1' },
        { lesson_id: lesson.id, horse_id: 'horse-2' },
      ])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].horse_count).toBe(2)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeInstructorLessonsChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('db error')
  })

  it('should_throw_when_lesson_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([], new Error('horses error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('horses error')
  })

  it('should_throw_when_lesson_riders_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([], new Error('riders error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('riders error')
  })

  it('should_throw_when_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain([], new Error('horse lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('horse lookup error')
  })

  it('should_throw_when_riders_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain([], new Error('rider lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('rider lookup error')
  })

  it('should_throw_when_profiles_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([], new Error('profiles error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('profiles error')
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain(null)
      if (table === 'lesson_riders') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].horse_names).toEqual([])
  })

  it('should_treat_null_lesson_riders_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_names).toEqual([])
  })

  it('should_return_zero_rider_count_when_lesson_riders_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_count).toBe(0)
  })

  it('should_treat_null_profiles_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_treat_null_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].horse_names).toEqual([])
  })

  it('should_return_empty_rider_names_when_riders_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_names).toEqual([])
  })

  it('should_preserve_rider_count_when_riders_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_count).toBe(1)
  })

  it('should_return_null_instructor_name_when_no_profile_exists', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_return_empty_horse_names_when_no_lesson_horses', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].horse_names).toEqual([])
  })

  it('should_return_instructor_name_for_rider_role', async () => {
    const lesson = createMockLesson({ instructor_id: 'instructor-1' })
    let lessonRidersCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') {
        lessonRidersCallCount++
        if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
        return makeInChain([])
      }
      if (table === 'lessons') return makeRiderLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'profiles') return makeInChain([{ user_id: 'instructor-1', first_name: 'Jane', last_name: 'Smith' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result[0].instructor_name).toBe('Jane Smith')
  })

  it('should_return_null_instructor_name_when_profiles_empty_for_rider_role', async () => {
    const lesson = createMockLesson({ instructor_id: 'instructor-1' })
    let lessonRidersCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'riders') return makeRiderLookupChain({ id: 'rider-1' })
      if (table === 'lesson_riders') {
        lessonRidersCallCount++
        if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
        return makeInChain([])
      }
      if (table === 'lessons') return makeRiderLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result[0].instructor_name).toBeNull()
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

