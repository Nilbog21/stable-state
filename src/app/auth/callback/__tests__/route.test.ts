import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  applySeededMembership: vi.fn().mockResolvedValue(undefined),
  getUserMembership: vi.fn(),
  getBarnMembershipsForUser: vi.fn(),
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
import { applySeededMembership, getUserMembership, getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { getBarnBySlug } from '@/lib/db/barns'
import { GET } from '../route'

const mockBarn = createMockBarn()
const mockMembership = createMockMembership({ id: 'm1' })

describe('GET /auth/callback', () => {
  beforeEach(() => {
    mockRedirect.mockImplementation((url: string | URL) => ({
      url: url.toString(),
      status: 302,
      cookies: { set: mockCookiesSet },
    }))
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
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

  it('should_not_call_applySeededMembership_when_user_has_no_email', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
      },
    } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=test-code')
    await GET(request as any)

    expect(applySeededMembership).not.toHaveBeenCalled()
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

  describe('without barn param', () => {
    beforeEach(() => {
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@barn.com' } } }),
        },
      } as any)
    })

    it('should_redirect_to_barn_home_when_single_active_membership', async () => {
      const barn = createMockBarn({ slug: 'green-acres' })
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn, membership: createMockMembership({ status: 'active' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres')
    })

    it('should_redirect_to_barns_when_multiple_active_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barns')
    })

    it('should_redirect_to_barn_pending_when_single_pending_membership', async () => {
      const barn = createMockBarn({ slug: 'green-acres' })
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn, membership: createMockMembership({ status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/pending')
    })

    it('should_redirect_to_barns_when_multiple_pending_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'pending' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barns')
    })

    it('should_redirect_to_login_no_barns_when_no_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/login?no_barns=true')
    })

    it('should_redirect_to_login_no_barns_when_user_is_null', async () => {
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      } as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/login?no_barns=true')
    })
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

    it('should_redirect_to_register_when_user_has_no_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(null)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith(
        'http://localhost:3000/barn/green-acres/register'
      )
    })

    it('should_redirect_to_pending_page_when_user_has_pending_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'm1', status: 'pending' }) as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith(
        'http://localhost:3000/barn/green-acres/pending'
      )
    })

    it('should_not_set_session_cookie_for_pending_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'm1', status: 'pending' }) as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockCookiesSet).not.toHaveBeenCalled()
    })

    it('should_redirect_to_login_error_when_barn_slug_is_not_found', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(null)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=unknown-barn')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith(
        'http://localhost:3000/login?error=auth_callback_failed'
      )
    })

    it('should_treat_membership_as_null_when_user_is_null_after_exchange', async () => {
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
          getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        },
      } as any)
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(getUserMembership).not.toHaveBeenCalled()
      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/register')
    })
  })
})
