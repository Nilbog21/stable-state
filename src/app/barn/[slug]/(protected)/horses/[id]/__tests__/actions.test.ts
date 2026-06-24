import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  setHorseAvailability: vi.fn(),
  updateHorse: vi.fn(),
  setHorseActive: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability, updateHorse, setHorseActive } from '@/lib/db/horses'
import { revalidatePath } from 'next/cache'
import { updateHorseAvailabilityAction, renameHorseAction, setHorseActiveAction } from '../actions'

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

describe('renameHorseAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateHorse).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateHorse).mockResolvedValue({} as any)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    const formData = new FormData()
    formData.set('name', 'Stormy')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateHorse_with_trimmed_name_and_barn_id', async () => {
    const formData = new FormData()
    formData.set('name', '  Stormy  ')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).toHaveBeenCalledWith('horse-1', mockBarn.id, 'Stormy')
  })

  it('should_not_call_updateHorse_when_name_is_blank', async () => {
    const formData = new FormData()
    formData.set('name', '   ')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_not_call_updateHorse_when_name_field_is_absent', async () => {
    const formData = new FormData()

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_revalidate_horses_list_path', async () => {
    const formData = new FormData()
    formData.set('name', 'Stormy')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_revalidate_horse_detail_path', async () => {
    const formData = new FormData()
    formData.set('name', 'Stormy')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})

describe('setHorseActiveAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(setHorseActive).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(setHorseActive).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', false)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_setHorseActive_with_false_when_deactivating', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', false)

    expect(setHorseActive).toHaveBeenCalledWith('horse-1', mockBarn.id, false)
  })

  it('should_call_setHorseActive_with_true_when_activating', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', true)

    expect(setHorseActive).toHaveBeenCalledWith('horse-1', mockBarn.id, true)
  })

  it('should_revalidate_horses_list_path', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', false)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', false)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})
