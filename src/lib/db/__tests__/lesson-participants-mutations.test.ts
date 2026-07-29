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
import {
  createLessonWithParticipants,
  updateLessonWithParticipants,
  updateLessonRiderNotes,
  updateLessonHorseNotes,
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

  it('should_store_a_utc_instant_that_decodes_back_to_the_intended_wall_clock_time_in_a_non_utc_timezone', async () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
      vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

      // Mirrors DateHourPicker.tsx's own construction: a lesson entered for
      // "4:00 PM" local time on 2026-05-16 (EDT, UTC-4).
      const intendedLocalHour = 16
      const lessonAt = new Date(2026, 4, 16, intendedLocalHour).toISOString()

      await createLessonWithParticipants({
        barnId: 'barn-1',
        instructorId: 'user-1',
        lessonAt,
        fee: 75,
        horseIds: ['horse-1'],
        exertionLevels: [3],
        riderIds: ['rider-1'],
        lessonType: 'normal',
      })

      const [, rpcArgs] = mockRpc.mock.calls[0]
      const storedLessonAt = rpcArgs.p_lesson_at as string

      // The exact value the RPC receives is what lands in the lesson_at
      // TIMESTAMPTZ column — decoding it back (mirroring LessonForm.tsx's
      // parseInitialHour) must reproduce the wall-clock hour it was entered as.
      expect(new Date(storedLessonAt).getHours()).toBe(intendedLocalHour)
    } finally {
      process.env.TZ = originalTz
    }
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
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateLessonRiderNotes('lesson-1', 'rider-1', 'barn-1', 'Great progress today', 'Needs to work on posture')

    expect(mockRpc).toHaveBeenCalledWith('update_lesson_rider_notes', {
      p_lesson_id: 'lesson-1',
      p_rider_id: 'rider-1',
      p_barn_id: 'barn-1',
      p_rider_notes: 'Great progress today',
      p_private_notes: 'Needs to work on posture',
    })
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      updateLessonRiderNotes('lesson-1', 'rider-1', 'barn-1', null, null)
    ).rejects.toThrow('db error')
  })
})

describe('updateLessonHorseNotes', () => {
  // #1082: no `.select()` anywhere in these chains — a bare `.select()` makes PostgREST
  // emit `RETURNING *`, which trips the column-restricted SELECT grant on lesson_horses.
  function mockUpdateChain(result: { error: Error | null }) {
    const mockEqBarn = vi.fn().mockResolvedValue(result)
    const mockEqHorse = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockEqLesson = vi.fn().mockReturnValue({ eq: mockEqHorse })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqLesson })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)
    return mockUpdate
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_update_on_lesson_horses_with_horse_notes', async () => {
    const mockUpdate = mockUpdateChain({ error: null })

    await updateLessonHorseNotes('lesson-1', 'horse-1', 'barn-1', 'Moved well today')

    expect(mockUpdate).toHaveBeenCalledWith({ horse_notes: 'Moved well today' })
  })

  it('should_resolve_without_returning_a_row', async () => {
    mockUpdateChain({ error: null })

    const result = await updateLessonHorseNotes('lesson-1', 'horse-1', 'barn-1', 'Moved well today')

    expect(result).toBeUndefined()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    mockUpdateChain({ error: new Error('db error') })

    await expect(
      updateLessonHorseNotes('lesson-1', 'horse-1', 'barn-1', null)
    ).rejects.toThrow('db error')
  })
})

