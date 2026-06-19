import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  addHorseToLesson,
  addRiderToLesson,
  createLessonWithParticipants,
  updateLessonWithParticipants,
} from '../lesson-participants'

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

describe('addHorseToLesson', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
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
    vi.mocked(createClient).mockReset()
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

describe('createLessonWithParticipants', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

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
      p_jumping: false,
      p_tier_name: 'Custom',
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
      p_jumping: false,
      p_tier_name: 'Custom',
    })
  })

  it('should_call_rpc_with_jumping_true_when_jumping_is_true', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createLessonWithParticipants({
      barnId: 'barn-1',
      instructorId: 'user-1',
      lessonAt: '2026-05-16T10:00:00Z',
      fee: 75,
      horseIds: ['horse-1'],
      exertionLevels: [3],
      riderIds: ['rider-1'],
      lessonType: 'normal',
      jumping: true,
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_with_participants',
      expect.objectContaining({ p_jumping: true })
    )
  })

  it('should_call_rpc_with_jumping_false_when_jumping_is_false', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createLessonWithParticipants({
      barnId: 'barn-1',
      instructorId: 'user-1',
      lessonAt: '2026-05-16T10:00:00Z',
      fee: 75,
      horseIds: ['horse-1'],
      exertionLevels: [3],
      riderIds: ['rider-1'],
      lessonType: 'normal',
      jumping: false,
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_with_participants',
      expect.objectContaining({ p_jumping: false })
    )
  })

  it('should_use_injected_client_when_provided', async () => {
    vi.mocked(createClient).mockReset()
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    const injectedClient = { rpc: mockRpc } as any

    await createLessonWithParticipants(
      { barnId: 'barn-1', instructorId: 'user-1', lessonAt: '2026-05-16T10:00:00Z', fee: 75, horseIds: ['horse-1'], exertionLevels: [3], riderIds: ['rider-1'], lessonType: 'normal' },
      injectedClient
    )

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalled()
  })
})

describe('updateLessonWithParticipants', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_update_lesson_with_participants_with_correct_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateLessonWithParticipants({
      lessonId: 'lesson-1',
      barnId: 'barn-1',
      lessonAt: '2026-05-17T10:00:00Z',
      instructorId: 'user-1',
      fee: 75,
      lessonType: 'normal',
      jumping: false,
      paymentType: null,
      tierName: 'Custom',
      horseIds: ['horse-1'],
      exertionLevels: [3],
      riderIds: ['rider-1'],
    })

    expect(mockRpc).toHaveBeenCalledWith('update_lesson_with_participants', {
      p_lesson_id: 'lesson-1',
      p_barn_id: 'barn-1',
      p_lesson_at: '2026-05-17T10:00:00Z',
      p_instructor_id: 'user-1',
      p_fee: 75,
      p_lesson_type: 'normal',
      p_jumping: false,
      p_payment_type: null,
      p_tier_name: 'Custom',
      p_horse_ids: ['horse-1'],
      p_exertion_levels: [3],
      p_rider_ids: ['rider-1'],
    })
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      updateLessonWithParticipants({
        lessonId: 'lesson-1',
        barnId: 'barn-1',
        lessonAt: '2026-05-17T10:00:00Z',
        instructorId: 'user-1',
        fee: null,
        lessonType: 'normal',
        jumping: false,
        paymentType: null,
        tierName: 'Custom',
        horseIds: ['horse-1'],
        exertionLevels: [3],
        riderIds: ['rider-1'],
      })
    ).rejects.toThrow('rpc failed')
  })
})
