import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  createLesson,
  addHorseToLesson,
  addRiderToLesson,
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
  lesson_id: 'lesson-1',
  horse_id: 'horse-1',
  exertion_level: 3,
}

const mockLessonRider = {
  id: 'lr-1',
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

    await addHorseToLesson('lesson-1', 'horse-1', 5)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ lesson_id: 'lesson-1', horse_id: 'horse-1', exertion_level: 5 })
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

    await addHorseToLesson('lesson-1', 'horse-1')

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

    const result = await addHorseToLesson('lesson-1', 'horse-1', 3)

    expect(result).toEqual(mockLessonHorse)
  })
})

describe('addRiderToLesson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_insert_lesson_rider_with_lesson_and_rider_ids', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockLessonRider, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await addRiderToLesson('lesson-1', 'rider-1')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ lesson_id: 'lesson-1', rider_id: 'rider-1' })
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

    const result = await addRiderToLesson('lesson-1', 'rider-1')

    expect(result).toEqual(mockLessonRider)
  })
})
