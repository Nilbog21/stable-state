import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import BarnPendingPage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
const mockUser = { id: 'user-1' }

const pendingMembership = {
  id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1',
  role: 'trainer' as const, status: 'pending' as const, created_at: '',
}

function setupAuth(user: typeof mockUser | null = mockUser) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

describe('BarnPendingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(pendingMembership)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(BarnPendingPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(BarnPendingPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_register_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(BarnPendingPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/register')
  })

  it('should_redirect_to_login_when_membership_is_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...pendingMembership, status: 'active' as const })
    await expect(BarnPendingPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_approval_pending_heading_for_pending_membership', async () => {
    const jsx = await BarnPendingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /approval pending/i })).toBeDefined()
  })

  it('should_display_barn_name_in_pending_message', async () => {
    const jsx = await BarnPendingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/green acres/i)).toBeDefined()
  })
})
