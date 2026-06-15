import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getBarnMembershipsForUser: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { createClient } from '@/lib/supabase/server'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import Home from '../page'

describe('Home', () => {
  beforeEach(() => {
    mockRedirect.mockClear()
    vi.mocked(createClient).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
  })

  describe('unauthenticated', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('should_render_landing_page_when_unauthenticated', async () => {
      setupAuth(null)
      const jsx = await Home()
      render(jsx)
      expect(screen.getByRole('heading', { name: /stable state/i })).toBeDefined()
    })

    it('should_show_connected_when_supabase_url_env_var_is_set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
      vi.mocked(createClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: new Error('Auth session missing'),
          }),
        },
      } as any)
      const jsx = await Home()
      render(jsx)
      expect(screen.getByText(/supabase connected/i)).toBeDefined()
    })

    it('should_show_env_vars_message_when_supabase_url_env_var_is_missing', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
      setupAuth(null)
      const jsx = await Home()
      render(jsx)
      expect(screen.getByText(/supabase env vars not set/i)).toBeDefined()
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

    it('should_redirect_to_barn_pending_when_single_pending_membership', async () => {
      setupAuth()
      const barn = createMockBarn({ slug: 'green-acres' })
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn, membership: createMockMembership({ status: 'pending' }) },
      ])
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
    })

    it('should_redirect_to_barns_when_multiple_pending_memberships', async () => {
      setupAuth()
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'pending' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'pending' }) },
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

    it('should_redirect_to_active_barn_when_user_has_mixed_active_and_pending_memberships', async () => {
      setupAuth()
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'active-barn' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'pending-barn' }), membership: createMockMembership({ id: 'm2', status: 'pending' }) },
      ])
      await expect(Home()).rejects.toThrow('NEXT_REDIRECT')
      expect(mockRedirect).toHaveBeenCalledWith('/barn/active-barn')
    })
  })
})
