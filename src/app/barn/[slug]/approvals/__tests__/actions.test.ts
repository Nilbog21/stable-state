import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import {
  getUserMembership,
  getAdminMembership,
  approveMembership,
  deleteMembership,
} from '@/lib/db/barn-memberships'
import { revalidatePath } from 'next/cache'
import {
  approveMembershipAction,
  rejectMembershipAction,
  removeMembershipAction,
} from '../actions'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
const mockUser = { id: 'user-1', email: 'manager@example.com' }
const mockManagerMembership = {
  id: 'mem-mgr',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'manager' as const,
  status: 'active' as const,
  created_at: '',
}
const mockAdminMembership = {
  id: 'mem-adm',
  user_id: 'user-1',
  barn_id: null,
  role: 'admin' as const,
  status: 'active' as const,
  created_at: '',
}

function setupAuth(user: typeof mockUser | null = mockUser) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

describe('approveMembershipAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
    vi.mocked(approveMembership).mockResolvedValue(undefined)
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

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
    vi.mocked(getUserMembership).mockResolvedValue({
      ...mockManagerMembership,
      role: 'trainer',
    })

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
})

describe('rejectMembershipAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    vi.clearAllMocks()
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
