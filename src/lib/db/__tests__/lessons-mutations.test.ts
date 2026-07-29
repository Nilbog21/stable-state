import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson, createMockLessonWithDetails } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../lesson-participants', async () => {
  const actual = await vi.importActual<typeof import('../lesson-participants')>('../lesson-participants')
  return { ...actual, hydrateParticipants: vi.fn() }
})

vi.mock('../barn-memberships', async () => {
  const actual = await vi.importActual<typeof import('../barn-memberships')>('../barn-memberships')
  return { ...actual, getMembershipByIdForBarn: vi.fn() }
})

vi.mock('../member-names', () => ({
  resolveMemberNames: vi.fn(),
}))

vi.mock('../profiles', async () => {
  const actual = await vi.importActual<typeof import('../profiles')>('../profiles')
  return { ...actual, getProfileById: vi.fn() }
})

import { createClient } from '@/lib/supabase/server'
import { hydrateParticipants } from '../lesson-participants'
import {
  createLesson,
  cancelLesson,
  deleteLesson,
  collectLessonPayment,
  updateLesson,
} from '../lessons'

const mockLesson = createMockLesson({ fee: 75, lesson_at: '2026-05-16T10:00:00Z', submitted_at: '2026-05-16T10:05:00Z' })

// hydrateParticipants is exercised directly in lesson-participants.test.ts;
// here it's mocked as a single unit that passes lessons through unchanged by default.
beforeEach(() => {
  vi.mocked(hydrateParticipants).mockImplementation(async (_supabase, lessons) =>
    lessons as unknown as ReturnType<typeof createMockLessonWithDetails>[]
  )
})

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

  function makeRpcMock(error: Error | null = null) {
    const mockRpc = vi.fn().mockResolvedValue({ error })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    return mockRpc
  }

  it('should_call_the_cancel_lesson_with_transactions_rpc_with_default_params', async () => {
    const mockRpc = makeRpcMock()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockRpc).toHaveBeenCalledWith('cancel_lesson_with_transactions', {
      p_lesson_id: 'lesson-1',
      p_barn_id: 'barn-1',
      p_notes: null,
      p_is_late: false,
    })
  })

  it('should_pass_notes_through_to_the_rpc', async () => {
    const mockRpc = makeRpcMock()
    await cancelLesson('lesson-1', 'barn-1', 'Trainer unavailable')
    expect(mockRpc).toHaveBeenCalledWith('cancel_lesson_with_transactions',
      expect.objectContaining({ p_notes: 'Trainer unavailable' })
    )
  })

  it('should_pass_null_notes_when_omitted', async () => {
    const mockRpc = makeRpcMock()
    await cancelLesson('lesson-1', 'barn-1')
    expect(mockRpc).toHaveBeenCalledWith('cancel_lesson_with_transactions',
      expect.objectContaining({ p_notes: null })
    )
  })

  it('should_pass_is_late_true_through_to_the_rpc', async () => {
    const mockRpc = makeRpcMock()
    await cancelLesson('lesson-1', 'barn-1', null, true)
    expect(mockRpc).toHaveBeenCalledWith('cancel_lesson_with_transactions',
      expect.objectContaining({ p_is_late: true })
    )
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeRpcMock(new Error('db error'))
    await expect(cancelLesson('lesson-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('deleteLesson', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_call_the_delete_lesson_with_transactions_rpc_with_default_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await deleteLesson('lesson-1', 'barn-1')

    expect(mockRpc).toHaveBeenCalledWith('delete_lesson_with_transactions', {
      p_lesson_id: 'lesson-1',
      p_barn_id: 'barn-1',
      p_delete_collected: false,
    })
  })

  it('should_pass_delete_collected_transactions_true_through_to_the_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await deleteLesson('lesson-1', 'barn-1', true)

    expect(mockRpc).toHaveBeenCalledWith('delete_lesson_with_transactions',
      expect.objectContaining({ p_delete_collected: true })
    )
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(deleteLesson('lesson-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('collectLessonPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_call_the_collect_lesson_payment_rpc_with_correct_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await collectLessonPayment('lesson-1', 'barn-1', 'venmo')

    expect(mockRpc).toHaveBeenCalledWith('collect_lesson_payment', {
      p_lesson_id: 'lesson-1',
      p_barn_id: 'barn-1',
      p_payment_type: 'venmo',
    })
  })

  it('should_pass_null_payment_type_through_to_the_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await collectLessonPayment('lesson-1', 'barn-1', null)

    expect(mockRpc).toHaveBeenCalledWith('collect_lesson_payment',
      expect.objectContaining({ p_payment_type: null })
    )
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('rpc error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(collectLessonPayment('lesson-1', 'barn-1', 'cash')).rejects.toThrow('rpc error')
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

