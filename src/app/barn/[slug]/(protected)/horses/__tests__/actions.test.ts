import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  createHorse: vi.fn(),
  updateHorse: vi.fn(),
  deleteHorse: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { createHorse, updateHorse, deleteHorse } from '@/lib/db/horses'
import { revalidatePath } from 'next/cache'
import { addHorseAction, updateHorseAction, deleteHorseAction } from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const mockHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt' })

describe('addHorseAction', () => {
  let formData: FormData

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(createHorse).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(createHorse).mockResolvedValue(mockHorse)
    formData = new FormData()
    formData.set('name', 'Thunderbolt')
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await addHorseAction('green-acres', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_createHorse_when_manager', async () => {
    await addHorseAction('green-acres', formData)

    expect(createHorse).toHaveBeenCalledWith(mockBarn.id, 'Thunderbolt')
  })

  it('should_revalidate_horses_path_after_createHorse', async () => {
    await addHorseAction('green-acres', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_not_call_createHorse_when_name_is_empty', async () => {
    formData.set('name', '   ')

    await addHorseAction('green-acres', formData)

    expect(createHorse).not.toHaveBeenCalled()
  })
})

describe('updateHorseAction', () => {
  let formData: FormData

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateHorse).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateHorse).mockResolvedValue(mockHorse)
    formData = new FormData()
    formData.set('name', 'Thunderbolt Updated')
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await updateHorseAction('green-acres', 'horse-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateHorse_when_manager', async () => {
    await updateHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).toHaveBeenCalledWith('horse-1', 'Thunderbolt Updated')
  })

  it('should_revalidate_horses_path_after_updateHorse', async () => {
    await updateHorseAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_not_call_updateHorse_when_name_is_empty', async () => {
    formData.set('name', '   ')

    await updateHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).not.toHaveBeenCalled()
  })
})

describe('deleteHorseAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(deleteHorse).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await deleteHorseAction('green-acres', 'horse-1', new FormData())

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_deleteHorse_with_horse_and_barn_id_when_manager', async () => {
    await deleteHorseAction('green-acres', 'horse-1', new FormData())

    expect(deleteHorse).toHaveBeenCalledWith('horse-1', mockBarn.id)
  })

  it('should_revalidate_horses_path_after_deleteHorse', async () => {
    await deleteHorseAction('green-acres', 'horse-1', new FormData())

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })
})
