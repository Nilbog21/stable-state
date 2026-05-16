import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  applySeededMembership: vi.fn().mockResolvedValue(undefined),
  getUserMembership: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

const mockCookiesSet = vi.fn()
const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string | URL) => ({
    url: url.toString(),
    status: 302,
    cookies: { set: mockCookiesSet },
  }))
)
vi.mock('next/server', () => ({
  NextResponse: {
    redirect: mockRedirect,
  },
}))

import { createClient } from '@/lib/supabase/server'
import { applySeededMembership, getUserMembership } from '@/lib/db/barn-memberships'
import { getBarnBySlug } from '@/lib/db/barns'
import { GET } from '../route'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
const mockMembership = { id: 'm1', user_id: 'user-1', barn_id: 'barn-1', role: 'trainer', status: 'active', created_at: '' }

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedirect.mockImplementation((url: string | URL) => ({
      url: url.toString(),
      status: 302,
      cookies: { set: mockCookiesSet },
    }))
  })

  it('should_exchange_code_for_session_when_code_is_present', async () => {
    const mockExchange = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: mockExchange,
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } }),
      },
    } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=test-code')
    await GET(request as any)

    expect(mockExchange).toHaveBeenCalledWith('test-code')
  })

  it('should_redirect_to_home_on_successful_code_exchange', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } }),
      },
    } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=test-code')
    await GET(request as any)

    expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/')
  })

  it('should_apply_seeded_membership_after_successful_session_exchange', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'admin@example.com' } },
        }),
      },
    } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=test-code')
    await GET(request as any)

    expect(applySeededMembership).toHaveBeenCalledWith('user-1', 'admin@example.com')
  })

  it('should_redirect_to_error_page_when_no_code_is_present', async () => {
    const request = new Request('http://localhost:3000/auth/callback')
    await GET(request as any)

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=auth_callback_failed'
    )
  })

  it('should_redirect_to_error_page_when_session_exchange_fails', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          error: { message: 'exchange failed' },
        }),
      },
    } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=bad-code')
    await GET(request as any)

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=auth_callback_failed'
    )
  })

  describe('with barn param', () => {
    beforeEach(() => {
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'trainer@barn.com' } } }),
        },
      } as any)
    })

    it('should_set_barn_session_cookie_when_user_has_active_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.objectContaining({ httpOnly: true, path: '/barn/green-acres/' })
      )
    })

    it('should_redirect_to_barn_home_when_user_has_active_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/')
    })

    it('should_redirect_to_barn_login_error_when_user_has_no_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(null)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith(
        'http://localhost:3000/barn/green-acres/login?error=access_denied'
      )
    })

    it('should_redirect_to_login_error_when_barn_slug_is_not_found', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(null)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=unknown-barn')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith(
        'http://localhost:3000/login?error=auth_callback_failed'
      )
    })
  })
})
