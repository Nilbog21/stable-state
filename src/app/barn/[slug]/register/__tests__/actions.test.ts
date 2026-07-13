import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockUser } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ claimManagedMember: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { claimManagedMember } from '@/lib/db/barn-memberships'
import { acceptInvite } from '../actions'

describe('acceptInvite', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    vi.mocked(claimManagedMember).mockReset()
    setupAuth(createMockUser({ id: 'user-1', email: 'jane@example.com' }))
    vi.mocked(claimManagedMember).mockResolvedValue(undefined)
  })

  it('should_redirect_to_login_with_token_when_unauthenticated', async () => {
    setupAuth(null)
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login?token=tok-1')
  })

  it('should_not_call_claimManagedMember_when_unauthenticated', async () => {
    setupAuth(null)
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(claimManagedMember).not.toHaveBeenCalled()
  })

  it('should_claim_membership_with_token_user_id_and_email', async () => {
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(claimManagedMember).toHaveBeenCalledWith('tok-1', 'user-1', 'jane@example.com')
  })

  it('should_claim_membership_with_null_email_when_user_has_no_email', async () => {
    setupAuth({ id: 'user-1', email: null })
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(claimManagedMember).toHaveBeenCalledWith('tok-1', 'user-1', null)
  })

  it('should_redirect_to_barn_home_after_successful_claim', async () => {
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/')
  })

  it('should_redirect_back_to_register_with_error_param_when_claim_fails', async () => {
    vi.mocked(claimManagedMember).mockRejectedValue(new Error('token_not_found'))
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/register?token=tok-1&error=1')
  })
})
