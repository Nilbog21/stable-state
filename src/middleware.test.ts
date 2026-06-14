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

import middleware, { config } from './middleware'

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
    mockNextResponseNext.mockReturnValue(mockResponse)
    mockNextResponseRedirect.mockReturnValue(mockResponse)
    mockCreateServerClient.mockImplementation((_url: string, _key: string, _config: any) => ({
      auth: { getUser: mockGetUser },
    }))
  })

  it('should_redirect_unauthenticated_request_to_barn_route_to_login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const request = makeRequest('http://localhost:3000/barn/green-acres/dashboard')
    await middleware(request)

    expect(mockNextResponseRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/barn/green-acres/login') })
    )
  })

  it('should_export_config_with_matcher', () => {
    expect(Array.isArray(config.matcher)).toBe(true)
    expect(config.matcher.length).toBeGreaterThan(0)
  })
})
