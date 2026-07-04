import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  createLesson,
  cancelLesson,
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

describe('cancelLesson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeCancelChain(error: Error | null = null) {
    const mockEq2 = vi.fn().mockResolvedValue({ error })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)
    return { mockUpdate, mockEq1, mockEq2 }
  }

  it('should_set_cancelled_at_to_current_timestamp', async () => {
    const { mockUpdate } = makeCancelChain()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ cancelled_at: expect.any(String) }))
  })

  it('should_zero_the_fee', async () => {
    const { mockUpdate } = makeCancelChain()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ fee: 0 }))
  })

  it('should_null_out_payment_type', async () => {
    const { mockUpdate } = makeCancelChain()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ payment_type: null }))
  })

  it('should_save_cancellation_notes_when_provided', async () => {
    const { mockUpdate } = makeCancelChain()
    await cancelLesson('lesson-1', 'barn-1', 'Trainer unavailable')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ cancellation_notes: 'Trainer unavailable' }))
  })

  it('should_save_null_cancellation_notes_when_omitted', async () => {
    const { mockUpdate } = makeCancelChain()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ cancellation_notes: null }))
  })

  it('should_filter_by_lesson_id', async () => {
    const { mockEq1 } = makeCancelChain()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockEq1).toHaveBeenCalledWith('id', 'lesson-1')
  })

  it('should_filter_by_barn_id', async () => {
    const { mockEq2 } = makeCancelChain()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeCancelChain(new Error('db error'))
    await expect(cancelLesson('lesson-1', 'barn-1')).rejects.toThrow('db error')
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

  it('should_return_lessons_with_instructor_name_horse_names_and_rider_names', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'barn_memberships') return makeInChain([
        { id: 'mem-1', user_id: 'rider-user-1', profile_id: 'prof-rider-1' },
        { id: 'mem-instructor-1', user_id: 'user-1', profile_id: 'prof-instructor-1' },
      ])
      if (table === 'profiles') return makeInChain([{ id: 'prof-instructor-1', user_id: 'user-1', first_name: 'John', last_name: 'Doe' }, { id: 'prof-rider-1', user_id: 'rider-user-1', first_name: 'Alice', last_name: 'Rider' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result).toEqual([{
      ...lesson,
      instructor_name: 'John Doe',
      horse_names: ['Thunderbolt'],
      horse_ids: ['horse-1'],
      rider_names: ['Alice Rider'],
      rider_ids: ['mem-1'],
      rider_count: 1,
      horse_count: 1,
      rider_cancelled_ats: [null],
    }])
  })

  it('should_include_non_null_cancelled_at_for_cancelled_rider_participation', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1', cancelled_at: '2026-06-01T00:00:00Z' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'user-1', profile_id: 'prof-rider-1' }])
      if (table === 'profiles') return makeInChain([{ id: 'prof-rider-1', user_id: 'user-1', first_name: 'Alice', last_name: 'Rider' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].rider_cancelled_ats).toEqual(['2026-06-01T00:00:00Z'])
  })

  it('should_return_all_rider_names_for_group_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'mem-1' },
        { lesson_id: lesson.id, rider_id: 'mem-2' },
      ])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'barn_memberships') return makeInChain([
        { id: 'mem-1', user_id: 'user-1', profile_id: 'prof-rider-1' },
        { id: 'mem-2', user_id: 'user-2', profile_id: 'prof-rider-2' },
      ])
      if (table === 'profiles') return makeInChain([
        { id: 'prof-rider-1', user_id: 'user-1', first_name: 'Alice', last_name: 'Rider' },
        { id: 'prof-rider-2', user_id: 'user-2', first_name: 'Bob', last_name: 'Rider' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].rider_names).toEqual(['Alice Rider', 'Bob Rider'])
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

  it('should_use_membership_id_as_instructor_name_when_profile_not_found', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-instructor-1', user_id: 'user-1', profile_id: 'prof-instructor-1' }])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].instructor_name).toBe('mem-instructor-1')
  })

  it('should_return_null_instructor_name_when_instructor_membership_not_found', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'barn_memberships') return makeInChain([])
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

  it('should_return_horse_ids_alongside_horse_names', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].horse_ids).toEqual(['horse-1'])
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

  it('should_throw_when_barn_memberships_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'horses') return makeInChain([])
      if (table === 'barn_memberships') return makeInChain([], new Error('membership lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('membership lookup error')
  })

  it('should_throw_when_profiles_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-instructor-1', profile_id: 'prof-instructor-1' }])
      if (table === 'profiles') return makeInChain([], new Error('profiles error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('profiles error')
  })

  it('should_resolve_rider_name_from_separate_profiles_query', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'rider-user-1', profile_id: 'prof-rider-1' }])
      if (table === 'profiles') return makeInChain([{ id: 'prof-rider-1', user_id: 'rider-user-1', first_name: 'Alice', last_name: 'Rider' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].rider_names).toEqual(['Alice Rider'])
  })

  it('should_throw_when_rider_profiles_query_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: 'rider-user-1', profile_id: 'prof-rider-1' }])
      if (table === 'profiles') return makeInChain(null, new Error('rider profiles error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonsByBarn('barn-1', 'user-1', 'manager')).rejects.toThrow('rider profiles error')
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

  it('should_use_membership_id_as_instructor_name_when_profiles_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-instructor-1', profile_id: 'prof-instructor-1' }])
      if (table === 'profiles') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].instructor_name).toBe('mem-instructor-1')
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

  it('should_return_empty_rider_names_when_barn_memberships_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].rider_names).toEqual([])
    expect(result[0].rider_count).toBe(1)
  })

  it('should_use_membership_id_as_name_when_membership_profiles_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeInChain([{ id: 'mem-1', user_id: null }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonsByBarn('barn-1', 'user-1', 'manager')

    expect(result[0].rider_names).toEqual(['mem-1'])
  })

  describe('role_filtering', () => {
    function makeTrainerLessonsChain(data: unknown[], error: Error | null = null) {
      const mockOrder = vi.fn().mockResolvedValue({ data, error })
      const mockInstructorEq = vi.fn().mockReturnValue({ order: mockOrder })
      const mockBarnEq = vi.fn().mockReturnValue({ eq: mockInstructorEq })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
      return { select: mockSelect, mockBarnEq, mockInstructorEq, mockOrder }
    }

    function makeMembershipLookupChain(data: { id: string } | null, error: Error | null = null) {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
      const mockStatusEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
      const mockRoleEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
      const mockUserEq = vi.fn().mockReturnValue({ eq: mockRoleEq })
      const mockBarnEq = vi.fn().mockReturnValue({ eq: mockUserEq })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
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
      const { select: lessonsSelect, mockBarnEq } = makeTrainerLessonsChain([])
      const { select: membershipSelect } = makeCallerMembershipChain({ id: 'trainer-membership-1' })
      const fromFn = vi.fn().mockImplementation((table: string) =>
        table === 'barn_memberships' ? { select: membershipSelect } : { select: lessonsSelect }
      )
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer')

      expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_filter_by_instructor_id_for_trainer_role_using_callers_own_membership_id', async () => {
      const { select: lessonsSelect, mockInstructorEq } = makeTrainerLessonsChain([])
      const { select: membershipSelect } = makeCallerMembershipChain({ id: 'trainer-membership-1' })
      const fromFn = vi.fn().mockImplementation((table: string) =>
        table === 'barn_memberships' ? { select: membershipSelect } : { select: lessonsSelect }
      )
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      await getLessonsByBarn('barn-1', 'trainer-1', 'trainer')

      expect(mockInstructorEq).toHaveBeenCalledWith('instructor_id', 'trainer-membership-1')
    })

    it('should_return_empty_when_trainer_has_no_membership', async () => {
      const { select: membershipSelect } = makeCallerMembershipChain(null)
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({ select: membershipSelect }),
      } as any)

      const result = await getLessonsByBarn('barn-1', 'trainer-1', 'trainer')

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
        if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
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
      vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

      const result = await getLessonsByBarn('barn-1', 'user-1', 'rider')

      expect(result).toHaveLength(1)
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
    lesson_riders: [{ barn_memberships: { id: 'mem-1', user_id: null } }],
  }

  function makeLessonByIdChain(data: unknown, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect, mockEq1, mockEq2, mockMaybeSingle }
  }

  function makeFrom(
    lessonData: unknown,
    riderProfileData: unknown[] | null = null,
    instructorMembershipData: { user_id: string | null; profile_id: string } | null = null,
    instructorProfileData: unknown | null = null,
    lessonError: Error | null = null,
    riderProfileError: Error | null = null,
    instructorMembershipError: Error | null = null,
    instructorProfileError: Error | null = null,
  ) {
    const lessonChain = makeLessonByIdChain(lessonData, lessonError)
    return vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return { select: lessonChain.select }
      if (table === 'barn_memberships') {
        // Instructor membership query: .select('user_id, profile_id').eq('id', ...).maybeSingle()
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: instructorMembershipData, error: instructorMembershipError }),
            }),
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'id, first_name, last_name') {
              // Rider profiles query: .select('id, first_name, last_name').in('id', [...])
              return { in: vi.fn().mockResolvedValue({ data: riderProfileData, error: riderProfileError }) }
            }
            // Instructor profile query: .select('first_name, last_name').eq('id', ...).maybeSingle()
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: instructorProfileData, error: instructorProfileError }),
              }),
            }
          }),
        }
      }
      return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: null, error: null }) }) }
    })
  }

  it('should_return_lesson_with_instructor_name', async () => {
    const from = makeFrom(rawLessonData, null, { user_id: 'user-1', profile_id: 'prof-instructor-1' }, { first_name: 'Jane', last_name: 'Smith' })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_name).toBe('Jane Smith')
  })

  it('should_return_instructor_user_id', async () => {
    const from = makeFrom(rawLessonData, null, { user_id: 'user-1', profile_id: 'prof-instructor-1' }, { first_name: 'Jane', last_name: 'Smith' })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_user_id).toBe('user-1')
  })

  it('should_return_null_instructor_user_id_for_a_stub_trainer', async () => {
    const from = makeFrom(rawLessonData, null, { user_id: null, profile_id: 'prof-instructor-1' }, { first_name: 'Jane', last_name: 'Smith' })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_user_id).toBeNull()
  })

  it('should_return_null_instructor_name_when_instructor_id_is_null', async () => {
    const lessonWithoutInstructor = { ...rawLessonData, instructor_id: null }
    const { select } = makeLessonByIdChain(lessonWithoutInstructor)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_name).toBeNull()
  })

  it('should_return_null_instructor_name_when_profile_not_found', async () => {
    const from = makeFrom(rawLessonData, null, { user_id: 'user-1', profile_id: 'prof-instructor-1' }, null)
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_name).toBeNull()
  })

  it('should_return_null_instructor_name_and_user_id_when_instructor_membership_not_found', async () => {
    const from = makeFrom(rawLessonData, null, null, null)
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.instructor_name).toBeNull()
    expect(result?.instructor_user_id).toBeNull()
  })

  it('should_throw_when_instructor_membership_query_returns_error', async () => {
    const from = makeFrom(rawLessonData, null, null, null, null, null, new Error('instructor membership error'))
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonById('lesson-1', 'barn-1', 'trainer')).rejects.toThrow('instructor membership error')
  })

  it('should_return_all_riders_for_group_lesson', async () => {
    const groupLessonData = {
      ...createMockLesson({ lesson_type: 'group', instructor_id: null }),
      lesson_horses: [{ exertion_level: 3, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
      lesson_riders: [
        { barn_memberships: { id: 'mem-1', user_id: null } },
        { barn_memberships: { id: 'mem-2', user_id: null } },
      ],
    }
    const { select } = makeLessonByIdChain(groupLessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders).toHaveLength(2)
  })

  it('should_query_by_lesson_id_and_barn_id', async () => {
    const lessonDataNoInstructor = { ...rawLessonData, instructor_id: null }
    const { select, mockEq1, mockEq2 } = makeLessonByIdChain(lessonDataNoInstructor)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(mockEq1).toHaveBeenCalledWith('id', 'lesson-1')
    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_return_null_when_lesson_not_found', async () => {
    const { select } = makeLessonByIdChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('nonexistent', 'barn-1', 'trainer')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeLessonByIdChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await expect(getLessonById('lesson-1', 'barn-1', 'trainer')).rejects.toThrow('db error')
  })

  it('should_throw_when_instructor_profiles_query_returns_error', async () => {
    const from = makeFrom(rawLessonData, null, { user_id: 'user-1', profile_id: 'prof-instructor-1' }, null, null, null, null, new Error('instructor profiles error'))
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonById('lesson-1', 'barn-1', 'trainer')).rejects.toThrow('instructor profiles error')
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

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

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

  it('should_select_cancelled_at_for_rider_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = makeLessonByIdChain(noInstructorData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonById('lesson-1', 'barn-1', 'rider')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('cancelled_at'))
  })

  it('should_select_cancelled_at_for_manager_role', async () => {
    const noInstructorData = { ...createMockLesson({ instructor_id: null }), lesson_horses: [], lesson_riders: [] }
    const { select } = makeLessonByIdChain(noInstructorData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    await getLessonById('lesson-1', 'barn-1', 'manager')

    expect(select).toHaveBeenCalledWith(expect.stringContaining('cancelled_at'))
  })

  it('should_map_cancelled_at_onto_normalized_lesson_rider', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: null, cancelled_at: '2026-06-01T00:00:00Z', barn_memberships: { id: 'mem-1', user_id: null } }],
    }
    const { select } = makeLessonByIdChain(lessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].cancelled_at).toBe('2026-06-01T00:00:00Z')
  })

  it('should_default_cancelled_at_to_null_when_absent_on_normalized_lesson_rider', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: null, barn_memberships: { id: 'mem-1', user_id: null } }],
    }
    const { select } = makeLessonByIdChain(lessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].cancelled_at).toBeNull()
  })

  it('should_set_private_notes_to_null_for_rider_role', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: 'good position', barn_memberships: { id: 'mem-1', user_id: 'user-1' } }],
    }
    const { select } = makeLessonByIdChain(riderLessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return { select }
        return makeProfileInChain([{ user_id: 'user-1', first_name: 'Alice', last_name: 'Rider' }])
      }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider')

    expect(result?.lesson_riders[0].private_notes).toBeNull()
  })

  it('should_preserve_rider_notes_for_self_when_role_is_rider', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: 'good position', barn_memberships: { id: 'mem-1', user_id: 'user-1' } }],
    }
    const { select } = makeLessonByIdChain(riderLessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return { select }
        return makeProfileInChain([{ user_id: 'user-1', first_name: 'Alice', last_name: 'Rider' }])
      }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'user-1')

    expect(result?.lesson_riders[0].rider_notes).toBe('good position')
  })

  it('should_null_rider_notes_for_non_self_riders_when_role_is_rider', async () => {
    const riderLessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [
        { rider_notes: 'good position', barn_memberships: { id: 'mem-1', user_id: 'user-1' } },
        { rider_notes: 'needs work', barn_memberships: { id: 'mem-2', user_id: 'user-2' } },
      ],
    }
    const { select } = makeLessonByIdChain(riderLessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'lessons') return { select }
        return makeProfileInChain([
          { user_id: 'user-1', first_name: 'Alice', last_name: 'Rider' },
          { user_id: 'user-2', first_name: 'Bob', last_name: 'Rider' },
        ])
      }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'rider', 'user-1')

    expect(result?.lesson_riders[1].rider_notes).toBeNull()
  })

  it('should_use_membership_id_as_name_when_barn_membership_profiles_is_null', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ barn_memberships: { id: 'mem-1', user_id: null } }],
    }
    const { select } = makeLessonByIdChain(lessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].barn_membership?.name).toBe('mem-1')
  })

  it('should_return_null_barn_membership_when_lesson_riders_barn_memberships_is_null', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: null, barn_memberships: null }],
    }
    const { select } = makeLessonByIdChain(lessonData)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select }),
    } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].barn_membership).toBeNull()
  })

  it('should_resolve_rider_name_from_separate_profiles_query_in_get_lesson_by_id', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: null, barn_memberships: { id: 'mem-1', user_id: 'rider-user-1', profile_id: 'rider-profile-1' } }],
    }
    const from = makeFrom(lessonData, [{ id: 'rider-profile-1', first_name: 'Alice', last_name: 'Rider' }])
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].barn_membership?.name).toBe('Alice Rider')
  })

  it('should_use_membership_id_as_fallback_when_rider_profiles_returns_null_data', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: null, barn_memberships: { id: 'mem-1', user_id: null, profile_id: 'prof-1' } }],
    }
    const from = makeFrom(lessonData, null)
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].barn_membership?.name).toBe('mem-1')
  })

  it('should_resolve_managed_member_name_by_profile_id', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: null, barn_memberships: { id: 'mem-1', user_id: null, profile_id: 'managed-profile-1' } }],
    }
    const from = makeFrom(lessonData, [{ id: 'managed-profile-1', first_name: 'Alice', last_name: 'Managed' }])
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getLessonById('lesson-1', 'barn-1', 'trainer')

    expect(result?.lesson_riders[0].barn_membership?.name).toBe('Alice Managed')
  })

  it('should_throw_when_rider_profiles_query_fails_in_get_lesson_by_id', async () => {
    const lessonData = {
      ...createMockLesson({ instructor_id: null }),
      lesson_horses: [],
      lesson_riders: [{ rider_notes: null, barn_memberships: { id: 'mem-1', user_id: 'rider-user-1', profile_id: 'rider-profile-1' } }],
    }
    const from = makeFrom(lessonData, null, null, null, null, new Error('rider profiles error'))
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getLessonById('lesson-1', 'barn-1', 'trainer')).rejects.toThrow('rider profiles error')
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

  // For manager/trainer role, 'barn_memberships' is queried twice for different reasons:
  // once for the caller's own membership id (getUserMembership, .eq().eq().maybeSingle()),
  // and again inside hydrateParticipants for participant name resolution
  // (resolveMemberNames, .eq().in()). This single chain serves both shapes.
  function makeDualBarnMembershipsChain(
    callerMembershipData: { id: string } | null,
    memberRows: unknown[] | null = [],
    callerMembershipError: Error | null = null,
    memberRowsError: Error | null = null,
  ) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: callerMembershipData, error: callerMembershipError })
    const mockUserBarnEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockIn = vi.fn().mockResolvedValue({ data: memberRows, error: memberRowsError })
    const mockFirstEq = vi.fn().mockReturnValue({ eq: mockUserBarnEq, in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockFirstEq })
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
      if (table === 'barn_memberships') return makeMembershipLookupChain({ id: 'rider-1' })
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

  it('should_return_lessons_with_horse_names_and_rider_names', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const from2 = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'mem-instructor-1' }, [
        { id: 'mem-1', user_id: 'rider-user-1', profile_id: 'prof-rider-1' },
        { id: 'mem-instructor-1', user_id: 'user-1', profile_id: 'prof-instructor-1' },
      ])
      if (table === 'profiles') return makeInChain([{ id: 'prof-instructor-1', user_id: 'user-1', first_name: 'John', last_name: 'Doe' }, { id: 'prof-rider-1', user_id: 'rider-user-1', first_name: 'Alice', last_name: 'Rider' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: from2 } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result).toEqual([{
      ...lesson,
      instructor_name: 'John Doe',
      horse_names: ['Thunderbolt'],
      horse_ids: ['horse-1'],
      rider_names: ['Alice Rider'],
      rider_ids: ['mem-1'],
      rider_count: 1,
      horse_count: 1,
      rider_cancelled_ats: [null],
    }])
  })

  it('should_return_all_rider_names_for_group_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'mem-1' },
        { lesson_id: lesson.id, rider_id: 'mem-2' },
      ])
      if (table === 'horses') return makeInChain([{ id: 'horse-1', name: 'Thunderbolt' }])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'manager-membership-1' }, [
        { id: 'mem-1', user_id: 'user-1', profile_id: 'prof-rider-1' },
        { id: 'mem-2', user_id: 'user-2', profile_id: 'prof-rider-2' },
      ])
      if (table === 'profiles') return makeInChain([
        { id: 'prof-rider-1', user_id: 'user-1', first_name: 'Alice', last_name: 'Rider' },
        { id: 'prof-rider-2', user_id: 'user-2', first_name: 'Bob', last_name: 'Rider' },
      ])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_names).toEqual(['Alice Rider', 'Bob Rider'])
  })

  it('should_return_rider_count_for_group_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([
        { lesson_id: lesson.id, rider_id: 'mem-1' },
        { lesson_id: lesson.id, rider_id: 'mem-2' },
      ])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'manager-membership-1' }, [
        { id: 'mem-1', user_id: 'user-1' },
        { id: 'mem-2', user_id: 'user-2' },
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
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].horse_count).toBe(2)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeInstructorLessonsChain([], new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: fromWithCallerMembership(select) } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('db error')
  })

  it('should_throw_when_lesson_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([], new Error('horses error'))
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
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
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
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
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('horse lookup error')
  })

  it('should_throw_when_barn_memberships_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'manager-membership-1' }, [], null, new Error('membership lookup error'))
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')).rejects.toThrow('membership lookup error')
  })

  it('should_throw_when_profiles_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'manager-membership-1' }, [{ id: 'mem-instructor-1', profile_id: 'prof-instructor-1' }])
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
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
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
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
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
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_count).toBe(0)
  })

  it('should_use_membership_id_as_instructor_name_when_profiles_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'manager-membership-1' }, [{ id: 'mem-instructor-1', profile_id: 'prof-instructor-1' }])
      if (table === 'profiles') return makeInChain(null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].instructor_name).toBe('mem-instructor-1')
  })

  it('should_treat_null_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([{ lesson_id: lesson.id, horse_id: 'horse-1' }])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'horses') return makeInChain(null)
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].horse_names).toEqual([])
  })

  it('should_return_empty_rider_names_when_barn_memberships_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'manager-membership-1' }, null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_names).toEqual([])
  })

  it('should_preserve_rider_count_when_barn_memberships_data_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([{ lesson_id: lesson.id, rider_id: 'mem-1' }])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'manager-membership-1' }, null)
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].rider_count).toBe(1)
  })

  it('should_use_membership_id_as_instructor_name_when_profile_not_found', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'barn_memberships') return makeDualBarnMembershipsChain({ id: 'manager-membership-1' }, [{ id: 'mem-instructor-1', profile_id: 'prof-instructor-1' }])
      if (table === 'profiles') return makeInChain([])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].instructor_name).toBe('mem-instructor-1')
  })

  it('should_return_empty_horse_names_when_no_lesson_horses', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'lessons') return makeInstructorLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'lesson_riders') return makeInChain([])
      if (table === 'barn_memberships') return makeCallerMembershipChain({ id: 'manager-membership-1' })
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'manager')

    expect(result[0].horse_names).toEqual([])
  })

  // rider role: 'barn_memberships' serves both getRiderEnrolledLessonIds' own
  // rider-membership lookup (eq*4 -> maybeSingle) and resolveMemberNames' participant
  // name resolution (eq -> in) off the same mocked table.
  function makeRiderPathBarnMembershipsChain(
    riderMembershipData: { id: string } | null,
    memberRows: unknown[] | null = [],
  ) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: riderMembershipData, error: null })
    const mockStatusEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockRoleEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
    const mockUserEq = vi.fn().mockReturnValue({ eq: mockRoleEq })
    const mockIn = vi.fn().mockResolvedValue({ data: memberRows, error: null })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockUserEq, in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockBarnEq })
    return { select: mockSelect }
  }

  it('should_return_instructor_name_for_rider_role', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    let lessonRidersCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeRiderPathBarnMembershipsChain({ id: 'rider-1' }, [{ id: 'mem-instructor-1', profile_id: 'prof-instructor-1' }])
      if (table === 'lesson_riders') {
        lessonRidersCallCount++
        if (lessonRidersCallCount === 1) return makeEnrollmentChain([{ lesson_id: lesson.id }])
        return makeInChain([])
      }
      if (table === 'lessons') return makeRiderLessonsChain([lesson])
      if (table === 'lesson_horses') return makeInChain([])
      if (table === 'profiles') return makeInChain([{ id: 'prof-instructor-1', first_name: 'Jane', last_name: 'Smith' }])
      return makeInChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingLessons('barn-1', from, to, 'user-1', 'rider')

    expect(result[0].instructor_name).toBe('Jane Smith')
  })

  it('should_use_membership_id_as_instructor_name_when_profiles_empty_for_rider_role', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    let lessonRidersCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'barn_memberships') return makeRiderPathBarnMembershipsChain({ id: 'rider-1' }, [{ id: 'mem-instructor-1', profile_id: 'prof-instructor-1' }])
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

    expect(result[0].instructor_name).toBe('mem-instructor-1')
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

