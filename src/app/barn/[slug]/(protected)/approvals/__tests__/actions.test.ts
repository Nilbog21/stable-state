import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockProfile, createMockRider } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  approveMembership: vi.fn(),
  deleteMembership: vi.fn(),
  getMembershipById: vi.fn(),
}))

vi.mock('@/lib/db/riders', () => ({
  createRider: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfilesByUserIds: vi.fn(),
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
import { createRider } from '@/lib/db/riders'
import { getProfilesByUserIds } from '@/lib/db/profiles'
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
    vi.mocked(createRider).mockReset()
    vi.mocked(getProfilesByUserIds).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(approveMembership).mockResolvedValue(undefined)
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ role: 'trainer' }))
    vi.mocked(createRider).mockResolvedValue(createMockRider())
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
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

  it('should_create_rider_record_when_approved_membership_is_rider_role', async () => {
    const riderMembership = createMockMembership({ id: 'mem-1', role: 'rider', user_id: 'rider-user-1', barn_id: 'barn-1' })
    const profile = createMockProfile({ user_id: 'rider-user-1', first_name: 'Jane', last_name: 'Doe' })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfilesByUserIds).mockResolvedValue([profile])

    await approveMembershipAction('green-acres', 'mem-1')

    expect(createRider).toHaveBeenCalledWith('barn-1', 'Jane Doe', 'rider-user-1')
  })

  it('should_not_create_rider_record_when_approved_membership_is_trainer_role', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ role: 'trainer' }))

    await approveMembershipAction('green-acres', 'mem-1')

    expect(createRider).not.toHaveBeenCalled()
  })

  it('should_not_create_rider_record_when_membership_user_id_is_null', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ role: 'rider', user_id: null as unknown as string })
    )

    await approveMembershipAction('green-acres', 'mem-1')

    expect(createRider).not.toHaveBeenCalled()
  })

  it('should_not_create_rider_record_when_profile_is_not_found', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ role: 'rider' }))
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])

    await approveMembershipAction('green-acres', 'mem-1')

    expect(createRider).not.toHaveBeenCalled()
  })

  it('should_not_throw_when_rider_record_already_exists_for_user', async () => {
    const riderMembership = createMockMembership({ id: 'mem-1', role: 'rider', user_id: 'rider-user-1', barn_id: 'barn-1' })
    const profile = createMockProfile({ user_id: 'rider-user-1', first_name: 'Jane', last_name: 'Doe' })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfilesByUserIds).mockResolvedValue([profile])
    vi.mocked(createRider).mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }))

    await expect(approveMembershipAction('green-acres', 'mem-1')).resolves.toBeUndefined()
  })

  it('should_rethrow_when_rider_creation_fails_with_non_duplicate_error', async () => {
    const riderMembership = createMockMembership({ id: 'mem-1', role: 'rider', user_id: 'rider-user-1', barn_id: 'barn-1' })
    const profile = createMockProfile({ user_id: 'rider-user-1', first_name: 'Jane', last_name: 'Doe' })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfilesByUserIds).mockResolvedValue([profile])
    vi.mocked(createRider).mockRejectedValue(new Error('database connection error'))

    await expect(approveMembershipAction('green-acres', 'mem-1')).rejects.toThrow('database connection error')
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
