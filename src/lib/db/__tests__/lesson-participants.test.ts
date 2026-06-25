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
  getRiderEnrolledLessonIds,
  updateLessonWithParticipants,
  updateLessonRiderNotes,
  updateLessonHorseNotes,
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
      p_payment_type: null,
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
      p_payment_type: null,
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

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = { rpc: vi.fn().mockResolvedValue({ data: mockLesson, error: null }) } as any

    await createLessonWithParticipants(
      { barnId: 'barn-1', instructorId: 'user-1', lessonAt: '2026-05-16T10:00:00Z', fee: 75, horseIds: ['horse-1'], exertionLevels: [3], riderIds: ['rider-1'], lessonType: 'normal' },
      injectedClient
    )

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    vi.mocked(createClient).mockReset()
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    const injectedClient = { rpc: mockRpc } as any

    await createLessonWithParticipants(
      { barnId: 'barn-1', instructorId: 'user-1', lessonAt: '2026-05-16T10:00:00Z', fee: 75, horseIds: ['horse-1'], exertionLevels: [3], riderIds: ['rider-1'], lessonType: 'normal' },
      injectedClient
    )

    expect(mockRpc).toHaveBeenCalled()
  })

  it('should_pass_payment_type_to_rpc_when_provided', async () => {
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
      paymentType: 'venmo',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_with_participants',
      expect.objectContaining({ p_payment_type: 'venmo' })
    )
  })

  it('should_default_payment_type_to_null_when_not_provided', async () => {
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
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_with_participants',
      expect.objectContaining({ p_payment_type: null })
    )
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

describe('updateLessonRiderNotes', () => {
  const mockUpdatedRider = {
    id: 'lr-1',
    barn_id: 'barn-1',
    lesson_id: 'lesson-1',
    rider_id: 'rider-1',
    rider_notes: 'Great progress today',
    private_notes: 'Needs to work on posture',
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_update_on_lesson_riders_with_rider_notes_and_private_notes', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdatedRider, error: null })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqBarn = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEqRider = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockEqLesson = vi.fn().mockReturnValue({ eq: mockEqRider })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqLesson })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateLessonRiderNotes('lesson-1', 'rider-1', 'barn-1', 'Great progress today', 'Needs to work on posture')

    expect(mockUpdate).toHaveBeenCalledWith({ rider_notes: 'Great progress today', private_notes: 'Needs to work on posture' })
  })

  it('should_return_updated_lesson_rider', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdatedRider, error: null })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqBarn = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEqRider = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockEqLesson = vi.fn().mockReturnValue({ eq: mockEqRider })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: mockEqLesson }),
      }),
    } as any)

    const result = await updateLessonRiderNotes('lesson-1', 'rider-1', 'barn-1', 'Great progress today', 'Needs to work on posture')

    expect(result).toEqual(mockUpdatedRider)
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqBarn = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEqRider = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockEqLesson = vi.fn().mockReturnValue({ eq: mockEqRider })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: mockEqLesson }),
      }),
    } as any)

    await expect(
      updateLessonRiderNotes('lesson-1', 'rider-1', 'barn-1', null, null)
    ).rejects.toThrow('db error')
  })
})

describe('updateLessonHorseNotes', () => {
  const mockUpdatedHorse = {
    id: 'lh-1',
    barn_id: 'barn-1',
    lesson_id: 'lesson-1',
    horse_id: 'horse-1',
    exertion_level: 3,
    horse_notes: 'Moved well today',
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_update_on_lesson_horses_with_horse_notes', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdatedHorse, error: null })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqBarn = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEqHorse = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockEqLesson = vi.fn().mockReturnValue({ eq: mockEqHorse })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqLesson })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateLessonHorseNotes('lesson-1', 'horse-1', 'barn-1', 'Moved well today')

    expect(mockUpdate).toHaveBeenCalledWith({ horse_notes: 'Moved well today' })
  })

  it('should_return_updated_lesson_horse', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: mockUpdatedHorse, error: null })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqBarn = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEqHorse = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockEqLesson = vi.fn().mockReturnValue({ eq: mockEqHorse })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: mockEqLesson }),
      }),
    } as any)

    const result = await updateLessonHorseNotes('lesson-1', 'horse-1', 'barn-1', 'Moved well today')

    expect(result).toEqual(mockUpdatedHorse)
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqBarn = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEqHorse = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockEqLesson = vi.fn().mockReturnValue({ eq: mockEqHorse })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: mockEqLesson }),
      }),
    } as any)

    await expect(
      updateLessonHorseNotes('lesson-1', 'horse-1', 'barn-1', null)
    ).rejects.toThrow('db error')
  })
})

describe('getRiderEnrolledLessonIds', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_empty_array_when_user_has_no_rider_membership_in_barn', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEqStatus = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEqRole = vi.fn().mockReturnValue({ eq: mockEqStatus })
    const mockEqUserId = vi.fn().mockReturnValue({ eq: mockEqRole })
    const mockEqBarnId = vi.fn().mockReturnValue({ eq: mockEqUserId })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getRiderEnrolledLessonIds('barn-1', 'user-1')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_rider_has_no_enrollments', async () => {
    const mockFrom = vi.fn()
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'membership-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getRiderEnrolledLessonIds('barn-1', 'user-1')

    expect(result).toEqual([])
  })

  it('should_return_lesson_ids_for_enrolled_rider', async () => {
    const mockFrom = vi.fn()
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'membership-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ lesson_id: 'lesson-1' }, { lesson_id: 'lesson-2' }],
            error: null,
          }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getRiderEnrolledLessonIds('barn-1', 'user-1')

    expect(result).toEqual(['lesson-1', 'lesson-2'])
  })

  it('should_throw_when_barn_memberships_query_fails', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('membership error') }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(
      getRiderEnrolledLessonIds('barn-1', 'user-1')
    ).rejects.toThrow('membership error')
  })

  it('should_throw_when_lesson_riders_query_fails', async () => {
    const mockFrom = vi.fn()
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'membership-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error('enrollment error') }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await expect(
      getRiderEnrolledLessonIds('barn-1', 'user-1')
    ).rejects.toThrow('enrollment error')
  })
})
