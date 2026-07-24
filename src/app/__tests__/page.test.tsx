import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getBarnMembershipsForUser: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import Home from '../page'

describe('Home', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
  })

  describe('unauthenticated', () => {
    it('should_redirect_to_login_when_unauthenticated', async () => {
      setupAuth(null)
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/login')
    })
  })

  describe('authenticated', () => {
    it('should_redirect_to_barn_when_single_active_membership', async () => {
      setupAuth()
      const barn = createMockBarn({ slug: 'green-acres' })
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn, membership: createMockMembership({ status: 'active' }) },
      ])
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres')
    })

    it('should_redirect_to_barns_when_multiple_active_memberships', async () => {
      setupAuth()
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
      ])
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/barns')
    })

    it('should_redirect_to_login_no_barns_when_no_memberships', async () => {
      setupAuth()
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/login?no_barns=true')
    })
  })
})
