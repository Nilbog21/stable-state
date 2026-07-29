import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  cancelRiderParticipation,
  updateCancellationFeePaymentType,
} from '../lesson-participants'

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

