import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockProfile, createMockRider } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getAdminMembership: vi.fn(),
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

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import {
  getUserMembership,
  getAdminMembership,
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
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const mockAdminMembership = createMockMembership({ id: 'mem-adm', barn_id: null, role: 'admin' })

describe('approveMembershipAction', () => {
  beforeEach(() => {
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
    vi.mocked(approveMembership).mockResolvedValue(undefined)
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ role: 'trainer' }))
    vi.mocked(createRider).mockResolvedValue(createMockRider())
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(approveMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(approveMembership).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_is_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(approveMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(approveMembership).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(null)

    await expect(approveMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(approveMembership).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_is_trainer_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'mem-mgr', role: 'trainer' }))

    await expect(approveMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(approveMembership).not.toHaveBeenCalled()
  })

  it('should_call_approve_helper_when_manager', async () => {
    await approveMembershipAction('green-acres', 'mem-1')

    expect(approveMembership).toHaveBeenCalledWith('mem-1')
  })

  it('should_call_approve_helper_when_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(mockAdminMembership)

    await approveMembershipAction('green-acres', 'mem-1')

    expect(approveMembership).toHaveBeenCalledWith('mem-1')
  })

  it('should_revalidate_approvals_path_after_approve', async () => {
    await approveMembershipAction('green-acres', 'mem-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/approvals')
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
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
    vi.mocked(deleteMembership).mockResolvedValue(undefined)
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(rejectMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_is_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(rejectMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_is_not_manager_or_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(null)

    await expect(rejectMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_call_delete_helper_when_manager', async () => {
    await rejectMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).toHaveBeenCalledWith('mem-1')
  })

  it('should_call_delete_helper_when_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(mockAdminMembership)

    await rejectMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).toHaveBeenCalledWith('mem-1')
  })

  it('should_revalidate_approvals_path_after_reject', async () => {
    await rejectMembershipAction('green-acres', 'mem-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/approvals')
  })
})

describe('removeMembershipAction', () => {
  beforeEach(() => {
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(mockAdminMembership)
    vi.mocked(deleteMembership).mockResolvedValue(undefined)
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(removeMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_is_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(removeMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_redirect_when_user_is_manager_not_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)

    await expect(removeMembershipAction('green-acres', 'mem-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_call_delete_helper_when_admin', async () => {
    await removeMembershipAction('green-acres', 'mem-1')

    expect(deleteMembership).toHaveBeenCalledWith('mem-1')
  })

  it('should_revalidate_approvals_path_after_remove', async () => {
    await removeMembershipAction('green-acres', 'mem-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/approvals')
  })
})
