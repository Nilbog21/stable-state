import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
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
import { GET } from '../route'

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedirect.mockImplementation((url: string | URL) => ({ url: url.toString(), status: 302 }))
  })

  it('should_exchange_code_for_session_when_code_is_present', async () => {
    const mockExchange = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      auth: { exchangeCodeForSession: mockExchange },
    } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=test-code')
    await GET(request as any)

    expect(mockExchange).toHaveBeenCalledWith('test-code')
  })

  it('should_redirect_to_home_on_successful_code_exchange', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      },
    } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=test-code')
    await GET(request as any)

    expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/')
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
