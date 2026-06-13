import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  createLesson,
  addHorseToLesson,
  addRiderToLesson,
  deleteLesson,
  getLessonsByBarn,
  getLessonById,
  createLessonWithParticipants,
  getFinancialSummary,
  getUpcomingLessons,
  getHorseIncomeSummary,
} from '../lessons'

const mockLesson = createMockLesson({ fee: 75, lesson_at: '2026-05-16T10:00:00Z', submitted_at: '2026-05-16T10:05:00Z' })

const mockLessonHorse = {
  id: 'lh-1',
  barn_id: 'barn-1',
  lesson_id: 'lesson-1',
  horse_id: 'horse-1',
  exertion_level: 3,
}

const mockLessonRider = {
  id: 'lr-1',
  barn_id: 'barn-1',
  lesson_id: 'lesson-1',
  rider_id: 'rider-1',
}

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

describe('addHorseToLesson', () => {
  it('should_insert_lesson_horse_with_provided_exertion_level', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { ...mockLessonHorse, exertion_level: 5 }, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await addHorseToLesson('lesson-1', 'horse-1', 'barn-1', 5)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ lesson_id: 'lesson-1', horse_id: 'horse-1', barn_id: 'barn-1', exertion_level: 5 })
    )
  })

  it('should_default_exertion_level_to_3_when_not_provided', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockLessonHorse, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await addHorseToLesson('lesson-1', 'horse-1', 'barn-1')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ exertion_level: 3 })
    )
  })

  it('should_return_the_created_lesson_horse', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockLessonHorse, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await addHorseToLesson('lesson-1', 'horse-1', 'barn-1', 3)

    expect(result).toEqual(mockLessonHorse)
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
      addHorseToLesson('lesson-1', 'horse-1', 'barn-1')
    ).rejects.toThrow('db error')
  })
})

describe('addRiderToLesson', () => {
  it('should_insert_lesson_rider_with_lesson_rider_and_barn_ids', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockLessonRider, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await addRiderToLesson('lesson-1', 'rider-1', 'barn-1')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ lesson_id: 'lesson-1', rider_id: 'rider-1', barn_id: 'barn-1' })
    )
  })

  it('should_return_the_created_lesson_rider', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockLessonRider, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await addRiderToLesson('lesson-1', 'rider-1', 'barn-1')

    expect(result).toEqual(mockLessonRider)
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
      addRiderToLesson('lesson-1', 'rider-1', 'barn-1')
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

  it('should_return_lessons_for_the_barn_ordered_by_lesson_at_asc', async () => {
    const { select, mockEq, mockOrder } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonsByBarn('barn-1')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
  })

  it('should_return_empty_array_when_no_lessons', async () => {
    const { select } = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonsByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_return_lessons_with_instructor_name_horse_names_and_rider_name', async () => {
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
      rider_name: 'Alice',
    }])
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

    expect(result[0].rider_name).toBeNull()
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

  it('should_return_null_rider_name_when_riders_data_is_null', async () => {
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

    expect(result[0].rider_name).toBeNull()
  })
})

describe('getLessonById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockLessonDetail = {
    ...createMockLesson(),
    profiles: { first_name: 'Jane', last_name: 'Smith' },
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

  it('should_return_lesson_with_joined_profiles_horses_and_riders', async () => {
    const { select } = makeLessonByIdChain(mockLessonDetail)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1')

    expect(result).toEqual(mockLessonDetail)
  })

  it('should_query_by_lesson_id_and_barn_id', async () => {
    const { select, mockEq1, mockEq2 } = makeLessonByIdChain(mockLessonDetail)
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
})

describe('createLessonWithParticipants', () => {
  it('should_call_rpc_with_correct_parameters', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createLessonWithParticipants({
      barnId: 'barn-1',
      instructorId: 'user-1',
      lessonAt: '2026-05-16T10:00:00Z',
      fee: 75,
      horseIds: ['horse-1', 'horse-2'],
      exertionLevels: [3, 5],
      riderIds: ['rider-1'],
      lessonType: 'normal',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_with_participants', {
      p_barn_id: 'barn-1',
      p_instructor_id: 'user-1',
      p_lesson_at: '2026-05-16T10:00:00Z',
      p_fee: 75,
      p_horse_ids: ['horse-1', 'horse-2'],
      p_exertion_levels: [3, 5],
      p_rider_ids: ['rider-1'],
      p_lesson_type: 'normal',
    })
  })

  it('should_return_the_created_lesson', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: mockLesson, error: null }),
    } as any)

    const result = await createLessonWithParticipants({
      barnId: 'barn-1',
      instructorId: 'user-1',
      lessonAt: '2026-05-16T10:00:00Z',
      fee: 75,
      horseIds: ['horse-1'],
      exertionLevels: [3],
      riderIds: ['rider-1'],
      lessonType: 'normal',
    })

    expect(result).toEqual(mockLesson)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('rpc error') }),
    } as any)

    await expect(
      createLessonWithParticipants({
        barnId: 'barn-1',
        instructorId: 'user-1',
        lessonAt: '2026-05-16T10:00:00Z',
        fee: null,
        horseIds: ['horse-1'],
        exertionLevels: [3],
        riderIds: ['rider-1'],
        lessonType: 'normal',
      })
    ).rejects.toThrow('rpc error')
  })

  it('should_call_rpc_with_multiple_rider_ids', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createLessonWithParticipants({
      barnId: 'barn-1',
      instructorId: 'user-1',
      lessonAt: '2026-05-16T10:00:00Z',
      fee: 75,
      horseIds: ['horse-1'],
      exertionLevels: [3],
      riderIds: ['rider-1', 'rider-2'],
      lessonType: 'group',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_with_participants', {
      p_barn_id: 'barn-1',
      p_instructor_id: 'user-1',
      p_lesson_at: '2026-05-16T10:00:00Z',
      p_fee: 75,
      p_horse_ids: ['horse-1'],
      p_exertion_levels: [3],
      p_rider_ids: ['rider-1', 'rider-2'],
      p_lesson_type: 'group',
    })
  })
})

describe('getFinancialSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeSummaryChain(data: { fee: number | null }[], error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockGte, mockLt }
  }

  it('should_return_zero_total_and_empty_breakdown_when_no_lessons', async () => {
    const { select } = makeSummaryChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalIncome: 0, breakdown: [] })
  })

  it('should_return_correct_total_income_for_single_fee_tier', async () => {
    const { select } = makeSummaryChain([{ fee: 75 }, { fee: 75 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.totalIncome).toBe(150)
  })

  it('should_return_breakdown_sorted_ascending_by_fee', async () => {
    const { select } = makeSummaryChain([{ fee: 100 }, { fee: 50 }, { fee: 75 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.map((b) => b.fee)).toEqual([50, 75, 100])
  })

  it('should_exclude_lessons_with_null_fee_from_income', async () => {
    const { select } = makeSummaryChain([{ fee: 75 }, { fee: null }, { fee: 75 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.totalIncome).toBe(150)
    expect(result.breakdown).toHaveLength(1)
  })

  it('should_filter_lessons_by_date_range', async () => {
    const { select, mockEq, mockGte, mockLt } = makeSummaryChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getFinancialSummary('barn-1', startDate, endDate)

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockGte).toHaveBeenCalledWith('lesson_at', startDate.toISOString())
    expect(mockLt).toHaveBeenCalledWith('lesson_at', endDate.toISOString())
  })

  it('should_calculate_correct_subtotal_per_tier', async () => {
    const { select } = makeSummaryChain([{ fee: 50 }, { fee: 50 }, { fee: 100 }])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([
      { fee: 50, lessonCount: 2, subtotal: 100 },
      { fee: 100, lessonCount: 1, subtotal: 100 },
    ])
  })

  it('should_treat_null_data_as_empty', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalIncome: 0, breakdown: [] })
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeSummaryChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('db error')
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

  it('should_return_lessons_with_horse_names_and_rider_name', async () => {
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
      rider_name: 'Alice',
    }])
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

    expect(result[0].rider_name).toBeNull()
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

  it('should_return_null_rider_name_when_riders_data_is_null', async () => {
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

    expect(result[0].rider_name).toBeNull()
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

describe('getHorseIncomeSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  function makeLessonsChain(data: { id: string; fee: number | null }[], error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  it('should_return_empty_when_no_lessons_in_range', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([])),
    } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_all_lessons_have_null_fee', async () => {
    const lesson = createMockLesson({ fee: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([{ id: lesson.id, fee: null }])),
    } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_return_empty_when_lessons_have_no_horses', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_allocate_full_fee_to_single_horse', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }])
  })

  it('should_split_fee_evenly_across_two_horses', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson.id, horse_id: 'horse-1' },
        { lesson_id: lesson.id, horse_id: 'horse-2' },
      ])
      if (table === 'horses') return makeInChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.horseId === 'horse-1')?.totalIncome).toBe(50)
    expect(result.find((r) => r.horseId === 'horse-2')?.totalIncome).toBe(50)
  })

  it('should_split_fee_evenly_across_three_horses', async () => {
    const lesson = createMockLesson({ fee: 90 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 90 }])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson.id, horse_id: 'horse-1' },
        { lesson_id: lesson.id, horse_id: 'horse-2' },
        { lesson_id: lesson.id, horse_id: 'horse-3' },
      ])
      if (table === 'horses') return makeInChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
        { id: 'horse-3', name: 'Blaze' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toHaveLength(3)
    for (const row of result) {
      expect(row.totalIncome).toBe(30)
    }
  })

  it('should_aggregate_across_multiple_lessons_for_same_horse', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 100 })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 50 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson1.id, fee: 100 },
        { id: lesson2.id, fee: 50 },
      ])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson1.id, horse_id: 'horse-1' },
        { lesson_id: lesson2.id, horse_id: 'horse-1' },
      ])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 }])
  })

  it('should_sort_descending_by_total_income', async () => {
    const lesson = createMockLesson({ fee: 90 })
    const lesson2 = createMockLesson({ id: 'lesson-x', fee: 60 })
    const fromFn2 = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson.id, fee: 90 },
        { id: lesson2.id, fee: 60 },
      ])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson.id, horse_id: 'horse-1' },
        { lesson_id: lesson2.id, horse_id: 'horse-1' },
        { lesson_id: lesson2.id, horse_id: 'horse-2' },
      ])
      if (table === 'horses') return makeInChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn2 } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result[0].totalIncome).toBeGreaterThanOrEqual(result[1].totalIncome)
  })

  it('should_throw_when_lessons_fetch_returns_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeLessonsChain([], new Error('lessons error'))),
    } as any)

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_lesson_horses_fetch_returns_error', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain(null, new Error('lh error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('lh error')
  })

  it('should_throw_when_horses_fetch_returns_error', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'horses') return makeInChain(null, new Error('horses error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseIncomeSummary('barn-1', startDate, endDate)).rejects.toThrow('horses error')
  })

  it('should_treat_null_lessons_data_as_empty', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_skip_paid_lessons_with_no_horse_entries', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 100 })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 80 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([
        { id: lesson1.id, fee: 100 },
        { id: lesson2.id, fee: 80 },
      ])
      if (table === 'lesson_horses') return makeInChain([
        { lesson_id: lesson1.id, horse_id: 'horse-1' },
      ])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 100 }])
  })

  it('should_use_horse_id_as_fallback_when_horse_name_not_found', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-orphan' }])
      if (table === 'horses') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-orphan', horseName: 'horse-orphan', totalIncome: 100 }])
  })

  it('should_treat_null_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ fee: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([{ id: lesson.id, fee: 100 }])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'horses') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseIncomeSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ horseId: 'horse-1', horseName: 'horse-1', totalIncome: 100 }])
  })
})
