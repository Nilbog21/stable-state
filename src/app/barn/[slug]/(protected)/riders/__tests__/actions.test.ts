import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockRider } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/riders', () => ({
  updateRider: vi.fn(),
  deleteRider: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { updateRider, deleteRider } from '@/lib/db/riders'
import { revalidatePath } from 'next/cache'
import { updateRiderAction, deleteRiderAction } from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const mockRider = createMockRider({ id: 'rider-1', name: 'Jane Doe' })

describe('updateRiderAction', () => {
  let formData: FormData

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateRider).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateRider).mockResolvedValue(mockRider)
    formData = new FormData()
    formData.set('name', 'Jane Doe Updated')
  })

  it('should_call_requireMembership_with_manager_and_trainer_roles', async () => {
    await updateRiderAction('green-acres', 'rider-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer'])
  })

  it('should_call_updateRider_and_revalidate_when_manager', async () => {
    await updateRiderAction('green-acres', 'rider-1', formData)

    expect(updateRider).toHaveBeenCalledWith('rider-1', 'barn-1', 'Jane Doe Updated')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/riders')
  })

  it('should_call_updateRider_and_revalidate_when_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: createMockMembership({ id: 'mem-tr', role: 'trainer' }),
    })

    await updateRiderAction('green-acres', 'rider-1', formData)

    expect(updateRider).toHaveBeenCalledWith('rider-1', 'barn-1', 'Jane Doe Updated')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/riders')
  })

  it('should_not_call_updateRider_when_name_is_empty', async () => {
    formData.set('name', '   ')

    await updateRiderAction('green-acres', 'rider-1', formData)

    expect(updateRider).not.toHaveBeenCalled()
  })
})

describe('deleteRiderAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(deleteRider).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(deleteRider).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await deleteRiderAction('green-acres', 'rider-1')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_deleteRider_with_rider_and_barn_ids', async () => {
    await deleteRiderAction('green-acres', 'rider-1')

    expect(deleteRider).toHaveBeenCalledWith('rider-1', 'barn-1')
  })

  it('should_revalidate_riders_path', async () => {
    await deleteRiderAction('green-acres', 'rider-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/riders')
  })
})
