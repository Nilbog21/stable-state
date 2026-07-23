import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  createHorse: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { createHorse } from '@/lib/db/horses'
import { revalidatePath } from 'next/cache'
import { addHorseAction } from '../actions'

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

    expect(createHorse).toHaveBeenCalledWith(mockBarn.id, 'Thunderbolt', mockManagerMembership.id)
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
