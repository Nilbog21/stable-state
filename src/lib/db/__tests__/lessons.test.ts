import { describe, it, expect, vi, beforeEach } from 'vitest'

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
} from '../lessons'

const mockLesson = {
  id: 'lesson-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: '2026-05-16T10:00:00Z',
  submitted_at: '2026-05-16T10:05:00Z',
}

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
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('should_return_lessons_for_the_barn_ordered_by_lesson_at_desc', async () => {
    const lessons = [mockLesson]
    const mockOrder = vi.fn().mockResolvedValue({ data: lessons, error: null })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getLessonsByBarn('barn-1')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: false })
    expect(result).toEqual(lessons)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    await expect(getLessonsByBarn('barn-1')).rejects.toThrow('db error')
  })
})
