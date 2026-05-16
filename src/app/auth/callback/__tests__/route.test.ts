import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  applySeededMembership: vi.fn().mockResolvedValue(undefined),
}))

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string | URL) => ({ url: url.toString(), status: 302 }))
)
vi.mock('next/server', () => ({
  NextResponse: {
    redirect: mockRedirect,
  },
}))

import { createClient } from '@/lib/supabase/server'
import { applySeededMembership } from '@/lib/db/barn-memberships'
import { GET } from '../route'

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedirect.mockImplementation((url: string | URL) => ({ url: url.toString(), status: 302 }))
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
})
