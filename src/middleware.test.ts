import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockNextResponseNext = vi.hoisted(() => vi.fn())
const mockNextResponseRedirect = vi.hoisted(() => vi.fn())
const mockCreateServerClient = vi.hoisted(() => vi.fn())

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('next/server', () => ({
  NextResponse: {
    next: mockNextResponseNext,
    redirect: mockNextResponseRedirect,
  },
}))

import { middleware } from './middleware'

function makeRequest(url: string, cookies: Record<string, string> = {}) {
  const cookieEntries = Object.entries(cookies).map(([name, value]) => ({ name, value }))
  return {
    url,
    cookies: {
      getAll: () => cookieEntries,
      set: vi.fn(),
      get: (name: string) => cookieEntries.find((c) => c.name === name),
    },
    nextUrl: new URL(url),
  } as any
}

const mockResponse = { cookies: { set: vi.fn(), getAll: () => [] } }

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNextResponseNext.mockReturnValue(mockResponse)
    mockNextResponseRedirect.mockReturnValue(mockResponse)
    mockCreateServerClient.mockImplementation((_url: string, _key: string, _config: any) => ({
      auth: { getUser: mockGetUser },
    }))
  })

  describe('non-barn routes', () => {
    it('should_pass_through_requests_to_non_barn_routes', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

      await middleware(makeRequest('http://localhost:3000/login'))

      expect(mockNextResponseNext).toHaveBeenCalled()
      expect(mockNextResponseRedirect).not.toHaveBeenCalled()
    })
  })

  describe('barn routes', () => {
    it('should_pass_through_when_barn_session_cookie_matches_authenticated_user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

      const request = makeRequest(
        'http://localhost:3000/barn/green-acres/dashboard',
        { 'barn_session_green-acres': 'user-1' }
      )
      await middleware(request)

      expect(mockNextResponseRedirect).not.toHaveBeenCalled()
    })

    it('should_redirect_to_barn_login_when_barn_session_cookie_is_missing', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

      const request = makeRequest('http://localhost:3000/barn/green-acres/dashboard')
      await middleware(request)

      expect(mockNextResponseRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('/barn/green-acres/login') })
      )
    })

    it('should_redirect_to_barn_login_when_barn_session_cookie_belongs_to_different_user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

      const request = makeRequest(
        'http://localhost:3000/barn/green-acres/dashboard',
        { 'barn_session_green-acres': 'other-user' }
      )
      await middleware(request)

      expect(mockNextResponseRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ href: expect.stringContaining('/barn/green-acres/login') })
      )
    })

    it('should_not_redirect_barn_login_page_itself', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const request = makeRequest('http://localhost:3000/barn/green-acres/login')
      await middleware(request)

      expect(mockNextResponseRedirect).not.toHaveBeenCalled()
    })

    it('should_not_redirect_barn_register_page_itself', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const request = makeRequest('http://localhost:3000/barn/green-acres/register')
      await middleware(request)

      expect(mockNextResponseRedirect).not.toHaveBeenCalled()
    })

    it('should_not_redirect_barn_pending_page_itself', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const request = makeRequest('http://localhost:3000/barn/green-acres/pending')
      await middleware(request)

      expect(mockNextResponseRedirect).not.toHaveBeenCalled()
    })
  })

  describe('cookie handlers', () => {
    it('should_return_request_cookies_via_getAll_handler', async () => {
      let capturedConfig: any
      mockCreateServerClient.mockImplementationOnce((_url: string, _key: string, config: any) => {
        capturedConfig = config
        return { auth: { getUser: mockGetUser } }
      })
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const request = makeRequest('http://localhost:3000/login', { session: 'abc123' })
      await middleware(request)

      const cookies = capturedConfig.cookies.getAll()
      expect(cookies).toContainEqual({ name: 'session', value: 'abc123' })
    })

    it('should_propagate_cookies_to_request_and_response_via_setAll_handler', async () => {
      let capturedConfig: any
      mockCreateServerClient.mockImplementationOnce((_url: string, _key: string, config: any) => {
        capturedConfig = config
        return { auth: { getUser: mockGetUser } }
      })
      mockGetUser.mockResolvedValue({ data: { user: null } })

      const request = makeRequest('http://localhost:3000/login')
      await middleware(request)

      capturedConfig.cookies.setAll([{ name: 'token', value: 'xyz', options: { httpOnly: true } }])

      expect(request.cookies.set).toHaveBeenCalledWith('token', 'xyz')
      expect(mockResponse.cookies.set).toHaveBeenCalledWith('token', 'xyz', { httpOnly: true })
    })
  })
})
