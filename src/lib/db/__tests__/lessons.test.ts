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

    await getLessonsByBarn('barn-1')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: false })
  })

  it('should_return_empty_array_when_no_lessons', async () => {
    const { select } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

    expect(result[0].horse_names).toEqual([])
  })

  it('should_include_lesson_type_in_results', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1')

    expect(result[0].lesson_type).toBe('normal')
  })

  it('should_include_jumping_in_results', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1')

    expect(result[0].jumping).toBe(false)
  })

  it('should_include_jumping_true_in_results', async () => {
    const lesson = createMockLesson({ instructor_id: null, jumping: true })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

    expect(result[0].payment_type).toBeNull()
  })

  it('should_pass_through_non_null_payment_type', async () => {
    mockClientWithLesson(createMockLesson({ instructor_id: null, payment_type: 'venmo' }))

    const result = await getLessonsByBarn('barn-1')

    expect(result[0].payment_type).toBe('venmo')
  })

  it('should_throw_when_supabase_returns_an_error_on_lessons_fetch', async () => {
    const { select } = makeLessonsChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getLessonsByBarn('barn-1')).rejects.toThrow('db error')
  })

  it('should_throw_when_lesson_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([], new Error('horses error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1')).rejects.toThrow('horses error')
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

    await expect(getLessonsByBarn('barn-1')).rejects.toThrow('riders error')
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

    await expect(getLessonsByBarn('barn-1')).rejects.toThrow('horse lookup error')
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

    await expect(getLessonsByBarn('barn-1')).rejects.toThrow('rider lookup error')
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

    await expect(getLessonsByBarn('barn-1')).rejects.toThrow('profiles error')
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

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

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

    const result = await getLessonsByBarn('barn-1')

    expect(result[0].rider_names).toEqual([])
    expect(result[0].rider_count).toBe(1)
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
})

describe('getUpcomingLessons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const from = '2026-06-02T00:00:00.000Z'
  const to = '2026-06-09T00:00:00.000Z'

  function makeUpcomingChain(data: unknown[], error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockGte, mockLt, mockOrder }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  it('should_query_by_barn_id_and_date_range', async () => {
    const { select, mockEq, mockGte, mockLt, mockOrder } = makeUpcomingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getUpcomingLessons('barn-1', from, to)

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockGte).toHaveBeenCalledWith('lesson_at', from)
    expect(mockLt).toHaveBeenCalledWith('lesson_at', to)
    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
  })

  it('should_return_empty_array_when_no_lessons_in_range', async () => {
    const { select } = makeUpcomingChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result).toEqual([])
  })

  it('should_return_lessons_with_horse_names_and_rider_names', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const from2 = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'riders') return makeInChain([{ id: 'rider-1', name: 'Alice' }])
      if (table === 'profiles') return makeInChain([{ user_id: 'user-1', first_name: 'John', last_name: 'Doe' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: from2 } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

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
      if (table === 'lessons') return makeUpcomingChain([lesson])
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

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].rider_names).toEqual(['Alice', 'Bob'])
    expect(result[0].rider_count).toBe(2)
  })

  it('should_return_horse_count', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
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

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].horse_count).toBe(2)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeUpcomingChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getUpcomingLessons('barn-1', from, to)).rejects.toThrow('db error')
  })

  it('should_throw_when_lesson_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([], new Error('horses error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to)).rejects.toThrow('horses error')
  })

  it('should_throw_when_lesson_riders_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([], new Error('riders error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to)).rejects.toThrow('riders error')
  })

  it('should_throw_when_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain([], new Error('horse lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to)).rejects.toThrow('horse lookup error')
  })

  it('should_throw_when_riders_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain([], new Error('rider lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to)).rejects.toThrow('rider lookup error')
  })

  it('should_throw_when_profiles_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([], new Error('profiles error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to)).rejects.toThrow('profiles error')
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain(null)
      if (table === 'lesson_riders') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].horse_names).toEqual([])
  })

  it('should_treat_null_lesson_riders_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].rider_names).toEqual([])
    expect(result[0].rider_count).toBe(0)
  })

  it('should_treat_null_profiles_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_treat_null_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].horse_names).toEqual([])
  })

  it('should_return_empty_rider_names_when_riders_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'rider-1' }])
      if (table === 'riders') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].rider_names).toEqual([])
    expect(result[0].rider_count).toBe(1)
  })

  it('should_return_null_instructor_name_when_no_profile_exists', async () => {
    const lesson = createMockLesson({ instructor_id: 'user-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_return_empty_horse_names_when_no_lesson_horses', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeUpcomingChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to)

    expect(result[0].horse_names).toEqual([])
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

