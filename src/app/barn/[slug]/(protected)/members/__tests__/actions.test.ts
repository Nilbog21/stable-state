import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { makeFormData } from '@/test/utils/forms'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  createManagedMember: vi.fn(),
  revokeInviteToken: vi.fn(),
}))

const mockRevalidatePath = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

import { requireMembership } from '@/lib/auth/guard'
import { createManagedMember, revokeInviteToken } from '@/lib/db/barn-memberships'
import { createManagedMemberAction, revokeInviteTokenAction } from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })

describe('createManagedMemberAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(createManagedMember).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1', email: 'mgr@example.com' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(createManagedMember).mockResolvedValue({ membershipId: 'mem-new' })
  })

  it('should_call_createManagedMember_with_name_fields_and_rider_role', async () => {
    const fd = makeFormData({ first_name: 'Alex', last_name: 'Smith' })
    await createManagedMemberAction('green-acres', 'rider', fd)
    expect(createManagedMember).toHaveBeenCalledWith('barn-1', 'Alex', 'Smith', 'rider')
  })

  it('should_call_createManagedMember_with_name_fields_and_trainer_role', async () => {
    const fd = makeFormData({ first_name: 'Alex', last_name: 'Smith' })
    await createManagedMemberAction('green-acres', 'trainer', fd)
    expect(createManagedMember).toHaveBeenCalledWith('barn-1', 'Alex', 'Smith', 'trainer')
  })

  it('should_require_manager_role', async () => {
    const fd = makeFormData({ first_name: 'Alex', last_name: 'Smith' })
    await createManagedMemberAction('green-acres', 'rider', fd)
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_revalidate_members_path_after_creation', async () => {
    const fd = makeFormData({ first_name: 'Alex', last_name: 'Smith' })
    await createManagedMemberAction('green-acres', 'rider', fd)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/barn/green-acres/members')
  })

  it('should_not_call_createManagedMember_when_first_name_is_missing', async () => {
    const fd = makeFormData({ first_name: '', last_name: 'Smith' })
    await createManagedMemberAction('green-acres', 'rider', fd)
    expect(createManagedMember).not.toHaveBeenCalled()
  })

  it('should_not_call_createManagedMember_when_last_name_is_missing', async () => {
    const fd = makeFormData({ first_name: 'Alex', last_name: '' })
    await createManagedMemberAction('green-acres', 'rider', fd)
    expect(createManagedMember).not.toHaveBeenCalled()
  })

  it('should_not_call_createManagedMember_when_first_name_field_is_absent', async () => {
    const fd = makeFormData({ last_name: 'Smith' })
    await createManagedMemberAction('green-acres', 'rider', fd)
    expect(createManagedMember).not.toHaveBeenCalled()
  })

  it('should_not_call_createManagedMember_when_last_name_field_is_absent', async () => {
    const fd = makeFormData({ first_name: 'Alex' })
    await createManagedMemberAction('green-acres', 'rider', fd)
    expect(createManagedMember).not.toHaveBeenCalled()
  })
})

describe('revokeInviteTokenAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(revokeInviteToken).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1', email: 'mgr@example.com' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(revokeInviteToken).mockResolvedValue('new-tok-abc')
  })

  it('should_call_revokeInviteToken_with_membership_and_barn_ids', async () => {
    await revokeInviteTokenAction('green-acres', 'mem-1')
    expect(revokeInviteToken).toHaveBeenCalledWith('mem-1', 'barn-1')
  })

  it('should_require_manager_role', async () => {
    await revokeInviteTokenAction('green-acres', 'mem-1')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_revalidate_members_path_after_revoke', async () => {
    await revokeInviteTokenAction('green-acres', 'mem-1')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/barn/green-acres/members')
  })
})
