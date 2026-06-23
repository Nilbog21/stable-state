import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

afterEach(cleanup)

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getBarnMembershipsForUser: vi.fn(),
}))

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import ProfileLayout from '../layout'

function mockAuth(user: { id: string; email: string } | null) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
}

describe('ProfileLayout', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockReset()
    mockRedirect.mockClear()
  })

  it('should_redirect_to_login_when_not_authenticated', async () => {
    mockAuth(null)
    await expect(ProfileLayout({ children: <span>child</span> })).rejects.toMatchObject({
      digest: expect.stringContaining('/login'),
    })
  })

  it('should_render_back_link_to_barn_slug_when_user_has_one_active_membership', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
    ])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    const link = screen.getByRole('link', { name: /back/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres')
  })

  it('should_render_back_link_to_barns_when_user_has_multiple_active_memberships', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: createMockBarn({ id: 'barn-1', slug: 'barn-1-slug' }), membership: createMockMembership({ status: 'active' }) },
      { barn: createMockBarn({ id: 'barn-2', slug: 'barn-2-slug' }), membership: createMockMembership({ id: 'mem-2', barn_id: 'barn-2', status: 'active' }) },
    ])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    const link = screen.getByRole('link', { name: /back/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barns')
  })

  it('should_render_back_link_to_barns_when_user_has_no_active_memberships', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    const link = screen.getByRole('link', { name: /back/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barns')
  })
})
