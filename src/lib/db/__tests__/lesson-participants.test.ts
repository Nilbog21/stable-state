import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../horses', () => ({
  resolveHorseNames: vi.fn(),
}))

vi.mock('../member-names', () => ({
  resolveMemberNames: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { resolveHorseNames } from '../horses'
import { resolveMemberNames } from '../member-names'
import {
  createLessonWithParticipants,
  getRiderEnrolledLessonIds,
  updateLessonWithParticipants,
  updateLessonRiderNotes,
  updateLessonHorseNotes,
  cancelRiderParticipation,
  hydrateParticipants,
  updateCancellationFeePaymentType,
} from '../lesson-participants'

const mockLesson = createMockLesson({ fee: 75, lesson_at: '2026-05-16T10:00:00Z', submitted_at: '2026-05-16T10:05:00Z' })

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
      p_instructor_cut: 0,
    })
  })

  it('should_pass_instructor_cut_to_rpc_when_provided', async () => {
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
      instructorCut: 30,
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_with_participants',
      expect.objectContaining({ p_instructor_cut: 30 })
    )
  })

  it('should_default_instructor_cut_to_zero_when_not_provided', async () => {
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
      expect.objectContaining({ p_instructor_cut: 0 })
    )
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
        fee: 50,
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
      p_instructor_cut: 0,
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
      instructorCut: 30,
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
      p_instructor_cut: 30,
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
        fee: 50,
        lessonType: 'normal',
        jumping: false,
        paymentType: null,
        tierName: 'Custom',
        horseIds: ['horse-1'],
        exertionLevels: [3],
        riderIds: ['rider-1'],
        instructorCut: 25,
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

  it('should_not_call_createClient_when_client_is_injected', async () => {
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
    const injectedClient = { from: mockFrom } as any

    await getRiderEnrolledLessonIds('barn-1', 'user-1', injectedClient)

    expect(createClient).not.toHaveBeenCalled()
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

  it('should_treat_null_enrollments_data_as_empty', async () => {
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
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getRiderEnrolledLessonIds('barn-1', 'user-1')

    expect(result).toEqual([])
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

describe('cancelRiderParticipation', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_snake_case_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await cancelRiderParticipation('lesson-1', 'barn-1', 'rider-1', 'called in sick', true)

    expect(mockRpc).toHaveBeenCalledWith('cancel_rider_participation', {
      p_lesson_id: 'lesson-1',
      p_barn_id: 'barn-1',
      p_rider_id: 'rider-1',
      p_notes: 'called in sick',
      p_is_late: true,
    })
  })

  it('should_default_notes_to_null_when_undefined', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await cancelRiderParticipation('lesson-1', 'barn-1', 'rider-1', undefined, false)

    expect(mockRpc).toHaveBeenCalledWith('cancel_rider_participation',
      expect.objectContaining({ p_notes: null })
    )
  })

  it('should_pass_is_late_true_through_to_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await cancelRiderParticipation('lesson-1', 'barn-1', 'rider-1', null, true)

    expect(mockRpc).toHaveBeenCalledWith('cancel_rider_participation',
      expect.objectContaining({ p_is_late: true })
    )
  })

  it('should_pass_is_late_false_through_to_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await cancelRiderParticipation('lesson-1', 'barn-1', 'rider-1', null, false)

    expect(mockRpc).toHaveBeenCalledWith('cancel_rider_participation',
      expect.objectContaining({ p_is_late: false })
    )
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('rpc error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      cancelRiderParticipation('lesson-1', 'barn-1', 'rider-1', null, false)
    ).rejects.toThrow('rpc error')
  })

  it('should_return_true_when_rpc_reports_cascade', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: true, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await cancelRiderParticipation('lesson-1', 'barn-1', 'rider-1', null, false)

    expect(result).toBe(true)
  })

  it('should_return_false_when_rpc_reports_no_cascade', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: false, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await cancelRiderParticipation('lesson-1', 'barn-1', 'rider-1', null, false)

    expect(result).toBe(false)
  })
})

describe('updateCancellationFeePaymentType', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_snake_case_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateCancellationFeePaymentType('lesson-rider-1', 'barn-1', 'venmo')

    expect(mockRpc).toHaveBeenCalledWith('collect_rider_cancellation_fee', {
      p_lesson_rider_id: 'lesson-rider-1',
      p_barn_id: 'barn-1',
      p_payment_type: 'venmo',
    })
  })

  it('should_pass_null_payment_type_through_to_revert_to_unpaid', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateCancellationFeePaymentType('lesson-rider-1', 'barn-1', null)

    expect(mockRpc).toHaveBeenCalledWith('collect_rider_cancellation_fee',
      expect.objectContaining({ p_payment_type: null })
    )
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('rpc error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      updateCancellationFeePaymentType('lesson-rider-1', 'barn-1', 'venmo')
    ).rejects.toThrow('rpc error')
  })
})

describe('hydrateParticipants', () => {
  beforeEach(() => {
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
  })

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeSupabase(
    lessonHorses: unknown[] | null,
    lessonRiders: unknown[] | null,
    lessonHorsesError: Error | null = null,
    lessonRidersError: Error | null = null
  ) {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lesson_horses') return makeInChain(lessonHorses, lessonHorsesError)
      if (table === 'lesson_riders') return makeInChain(lessonRiders, lessonRidersError)
      return makeInChain([])
    })
    return { from } as any
  }

  it('should_return_empty_array_when_no_lessons', async () => {
    const result = await hydrateParticipants(makeSupabase([], []), [], 'barn-1')

    expect(result).toEqual([])
  })

  it('should_not_query_supabase_when_no_lessons', async () => {
    const supabase = makeSupabase([], [])

    await hydrateParticipants(supabase, [], 'barn-1')

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('should_resolve_instructor_name_from_membership_map', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-instructor-1', 'John Doe']]))

    const [result] = await hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1')

    expect(result.instructor_name).toBe('John Doe')
  })

  it('should_return_null_instructor_name_when_instructor_id_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const [result] = await hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1')

    expect(result.instructor_name).toBeNull()
  })

  it('should_return_null_instructor_name_when_membership_map_has_no_entry', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const [result] = await hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1')

    expect(result.instructor_name).toBeNull()
  })

  it('should_resolve_horse_names_for_a_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([{ lesson_id: lesson.id, horse_id: 'horse-1' }], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.horse_names).toEqual(['Thunderbolt'])
  })

  it('should_return_horse_ids_alongside_horse_names', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([{ lesson_id: lesson.id, horse_id: 'horse-1' }], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.horse_ids).toEqual(['horse-1'])
  })

  it('should_filter_out_a_horse_when_the_name_map_has_no_entry_for_it', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([{ lesson_id: lesson.id, horse_id: 'horse-1' }], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.horse_names).toEqual([])
  })

  it('should_count_horse_junction_rows_even_when_a_horse_name_is_unresolved', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([{ lesson_id: lesson.id, horse_id: 'horse-1' }], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.horse_count).toBe(1)
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(null, [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.horse_names).toEqual([])
  })

  it('should_resolve_rider_names_for_a_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.rider_names).toEqual(['Alice Rider'])
  })

  it('should_return_all_rider_names_for_a_group_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
      ['mem-1', 'Alice Rider'],
      ['mem-2', 'Bob Rider'],
    ]))
    const supabase = makeSupabase([], [
      { lesson_id: lesson.id, rider_id: 'mem-1' },
      { lesson_id: lesson.id, rider_id: 'mem-2' },
    ])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.rider_names).toEqual(['Alice Rider', 'Bob Rider'])
  })

  it('should_filter_out_a_rider_when_the_name_map_has_no_entry_for_it', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.rider_names).toEqual([])
  })

  it('should_count_rider_junction_rows_even_when_a_rider_name_is_unresolved', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.rider_count).toBe(1)
  })

  it('should_treat_null_lesson_riders_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([], null)

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.rider_names).toEqual([])
  })

  it('should_include_non_null_cancelled_at_for_a_cancelled_rider_participation', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1', cancelled_at: '2026-06-01T00:00:00Z' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.rider_cancelled_ats).toEqual(['2026-06-01T00:00:00Z'])
  })

  it('should_default_cancelled_at_to_null_when_absent', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.rider_cancelled_ats).toEqual([null])
  })

  it('should_not_attach_another_lessons_horse_to_the_first_lesson', async () => {
    const lessonA = createMockLesson({ id: 'lesson-a', instructor_id: null })
    const lessonB = createMockLesson({ id: 'lesson-b', instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([
      { lesson_id: 'lesson-a', horse_id: 'horse-1' },
      { lesson_id: 'lesson-b', horse_id: 'horse-2' },
    ], [])

    const [resultA] = await hydrateParticipants(supabase, [lessonA, lessonB], 'barn-1')

    expect(resultA.horse_names).toEqual(['Thunderbolt'])
  })

  it('should_not_attach_the_first_lessons_horse_to_another_lesson', async () => {
    const lessonA = createMockLesson({ id: 'lesson-a', instructor_id: null })
    const lessonB = createMockLesson({ id: 'lesson-b', instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([
      { lesson_id: 'lesson-a', horse_id: 'horse-1' },
      { lesson_id: 'lesson-b', horse_id: 'horse-2' },
    ], [])

    const [, resultB] = await hydrateParticipants(supabase, [lessonA, lessonB], 'barn-1')

    expect(resultB.horse_names).toEqual(['Shadow'])
  })

  it('should_throw_when_lesson_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const supabase = makeSupabase([], [], new Error('horses error'))

    await expect(hydrateParticipants(supabase, [lesson], 'barn-1')).rejects.toThrow('horses error')
  })

  it('should_throw_when_lesson_riders_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const supabase = makeSupabase([], [], null, new Error('riders error'))

    await expect(hydrateParticipants(supabase, [lesson], 'barn-1')).rejects.toThrow('riders error')
  })

  it('should_propagate_errors_from_resolve_horse_names', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockRejectedValue(new Error('resolve horse names error'))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await expect(hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1')).rejects.toThrow('resolve horse names error')
  })

  it('should_propagate_errors_from_resolve_member_names', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve member names error'))

    await expect(hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1')).rejects.toThrow('resolve member names error')
  })

  it('should_set_needs_attention_true_when_assigned_horse_is_inactive', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(
      [{ lesson_id: lesson.id, horse_id: 'horse-1', horses: { is_active: false, is_available: true } }],
      []
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.needs_attention).toBe(true)
  })

  it('should_set_needs_attention_true_when_assigned_horse_is_unavailable', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(
      [{ lesson_id: lesson.id, horse_id: 'horse-1', horses: { is_active: true, is_available: false } }],
      []
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.needs_attention).toBe(true)
  })

  it('should_set_needs_attention_false_when_all_assigned_horses_active_and_available', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(
      [{ lesson_id: lesson.id, horse_id: 'horse-1', horses: { is_active: true, is_available: true } }],
      []
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.needs_attention).toBe(false)
  })

  it('should_set_needs_attention_true_for_group_lesson_when_any_one_horse_is_bad', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([
      { lesson_id: lesson.id, horse_id: 'horse-1', horses: { is_active: true, is_available: true } },
      { lesson_id: lesson.id, horse_id: 'horse-2', horses: { is_active: false, is_available: true } },
    ], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1')

    expect(result.needs_attention).toBe(true)
  })
})
