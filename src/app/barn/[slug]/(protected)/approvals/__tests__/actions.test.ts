import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  approveMembership: vi.fn(),
  deleteMembership: vi.fn(),
  getMembershipById: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import {
  approveMembership,
  deleteMembership,
  getMembershipById,
} from '@/lib/db/barn-memberships'
import { revalidatePath } from 'next/cache'
import {
  approveMembershipAction,
  rejectMembershipAction,
  removeMembershipAction,
} from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })

describe('approveMembershipAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(approveMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(approveMembership).mockResolvedValue(undefined)
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ role: 'trainer' }))
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await approveMembershipAction('green-acres', 'mem-1')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_approve_helper_when_membership_belongs_to_barn', async () => {
    await approveMembershipAction('green-acres', 'mem-1')

    expect(approveMembership).toHaveBeenCalledWith('mem-1')
  })

  it('should_not_call_approveMembership_when_membership_belongs_to_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ barn_id: 'other-barn' })
    )

    await approveMembershipAction('green-acres', 'mem-1')

    expect(approveMembership).not.toHaveBeenCalled()
  })

  it('should_not_call_approveMembership_when_membership_not_found', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(null)

    await approveMembershipAction('green-acres', 'mem-1')

    expect(approveMembership).not.toHaveBeenCalled()
  })

  it('should_revalidate_settings_path_after_approve', async () => {
    await approveMembershipAction('green-acres', 'mem-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })

  it('should_approve_rider_membership_without_creating_a_separate_rider_record', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-1', role: 'rider', user_id: 'rider-user-1', barn_id: 'barn-1' })
    )

    await approveMembershipAction('green-acres', 'mem-1')

    expect(approveMembership).toHaveBeenCalledWith('mem-1')
  })
})

describe('rejectMembershipAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(deleteMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ barn_id: mockBarn.id }))
    vi.mocked(deleteMembership).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await rejectMembershipAction('green-acres', 'mem-1')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_delete_helper_when_membership_belongs_to_barn', async () => {
    await rejectMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).toHaveBeenCalledWith('mem-1')
  })

  it('should_not_call_deleteMembership_when_membership_belongs_to_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ barn_id: 'other-barn' }))

    await rejectMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_not_call_deleteMembership_when_membership_not_found', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(null)

    await rejectMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_revalidate_settings_path_after_reject', async () => {
    await rejectMembershipAction('green-acres', 'mem-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})

describe('removeMembershipAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(deleteMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ barn_id: mockBarn.id }))
    vi.mocked(deleteMembership).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await removeMembershipAction('green-acres', 'mem-1')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_delete_helper_when_membership_belongs_to_barn', async () => {
    await removeMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).toHaveBeenCalledWith('mem-1')
  })

  it('should_not_call_deleteMembership_when_membership_belongs_to_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ barn_id: 'other-barn' }))

    await removeMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_not_call_deleteMembership_when_membership_not_found', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(null)

    await removeMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_revalidate_settings_path_after_remove', async () => {
    await removeMembershipAction('green-acres', 'mem-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})
