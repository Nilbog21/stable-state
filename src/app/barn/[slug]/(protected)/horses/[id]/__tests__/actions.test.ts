import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  setHorseAvailability: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability } from '@/lib/db/horses'
import { revalidatePath } from 'next/cache'
import { updateHorseAvailabilityAction } from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

describe('updateHorseAvailabilityAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(setHorseAvailability).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(setHorseAvailability).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', 'stall rest')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_setHorseAvailability_with_false_and_reason_when_unavailable', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', 'stall rest')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, false, 'stall rest')
  })

  it('should_call_setHorseAvailability_with_true_and_null_reason_when_available', async () => {
    const formData = new FormData()
    formData.set('is_available', 'true')
    formData.set('reason', 'stall rest')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, true, null)
  })

  it('should_revalidate_horses_list_path', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', 'injury')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_revalidate_horse_detail_path', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', 'injury')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_treat_empty_reason_as_null_when_unavailable', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', '   ')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, false, null)
  })
})
