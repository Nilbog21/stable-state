import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockUser } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
// `isDemoClaimRejection` is spread in real, not stubbed — it is the whole of what routes the
// demo rejection away from the "invite invalid" screen, so a stub would assert nothing.
vi.mock('@/lib/db/member-invites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/member-invites')>()),
  claimManagedMember: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

const mockCookies = vi.hoisted(() => vi.fn())
vi.mock('next/headers', () => ({ cookies: mockCookies }))

import { claimManagedMember } from '@/lib/db/member-invites'
import { createClient } from '@/lib/supabase/server'
import { acceptInvite, signOutAndReturnToInvite } from '../actions'

function mockCookieStore() {
  const set = vi.fn()
  mockCookies.mockResolvedValue({ set })
  return { set }
}

describe('acceptInvite', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    vi.mocked(claimManagedMember).mockReset()
    setupAuth(createMockUser({ id: 'user-1', email: 'jane@example.com' }))
    vi.mocked(claimManagedMember).mockResolvedValue(undefined)
    mockCookieStore()
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

  it('should_set_barn_session_cookie_after_successful_claim', async () => {
    const { set } = mockCookieStore()
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(set).toHaveBeenCalledWith('barn_session_green-acres', 'user-1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/barn/green-acres',
    })
  })

  it('should_not_set_barn_session_cookie_when_unauthenticated', async () => {
    setupAuth(null)
    const { set } = mockCookieStore()
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(set).not.toHaveBeenCalled()
  })

  it('should_not_set_barn_session_cookie_when_claim_fails', async () => {
    vi.mocked(claimManagedMember).mockRejectedValue(new Error('token_not_found'))
    const { set } = mockCookieStore()
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(set).not.toHaveBeenCalled()
  })
})

// #1641. The demo session is caught at render, so this path needs a forged or raced POST to
// reach — but it must not tell the claimant their invite expired when the invite is fine.
// Redirecting back to the register page with the token intact (and no `error`) lets the page's
// own demo branch render the right screen, rather than minting a third error state.
describe('acceptInvite with a demo session', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    vi.mocked(claimManagedMember).mockReset()
    setupAuth(createMockUser({ id: 'demo-user-1', email: 'demo@stable-state.app' }))
    vi.mocked(claimManagedMember).mockRejectedValue(new Error('demo_account_cannot_claim'))
    mockCookieStore()
  })

  it('should_redirect_back_to_the_invite_without_an_error_param', async () => {
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/register?token=tok-1')
  })

  it('should_not_set_barn_session_cookie', async () => {
    const { set } = mockCookieStore()
    await expect(acceptInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(set).not.toHaveBeenCalled()
  })
})

// `signOut` from `@/app/actions/auth` lands on `/login` and strands the invite — the claimant
// would have to find the emailed link again. This keeps the journey going.
describe('signOutAndReturnToInvite', () => {
  const signOut = vi.fn()

  beforeEach(() => {
    mockRedirect.mockClear()
    signOut.mockReset().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockReset().mockResolvedValue({ auth: { signOut } } as any)
  })

  it('should_sign_the_session_out', async () => {
    await expect(signOutAndReturnToInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(signOut).toHaveBeenCalled()
  })

  it('should_redirect_to_the_barn_login_carrying_the_token', async () => {
    await expect(signOutAndReturnToInvite('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login?token=tok-1')
  })

  it('should_encode_the_token', async () => {
    await expect(signOutAndReturnToInvite('green-acres', 'a b')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login?token=a%20b')
  })
})
