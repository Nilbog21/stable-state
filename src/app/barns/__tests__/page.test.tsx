import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

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
import BarnsPage from '../page'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

const mockUser = { id: 'user-1', email: 'user@example.com' }

const mockActiveMembership = {
  barn: createMockBarn({ id: 'barn-1', name: 'Green Acres', slug: 'green-acres', instructor_cut: 25, created_at: '' }),
  membership: createMockMembership({
    id: 'mem-1',
    user_id: 'user-1',
    barn_id: 'barn-1',
    role: 'manager' as const,
    status: 'active' as const,
    created_at: '',
  }),
}

const mockPendingMembership = {
  barn: createMockBarn({ id: 'barn-2', name: 'Sunset Stables', slug: 'sunset-stables', instructor_cut: 25, created_at: '' }),
  membership: createMockMembership({
    id: 'mem-2',
    user_id: 'user-1',
    barn_id: 'barn-2',
    role: 'rider' as const,
    status: 'pending' as const,
    created_at: '',
  }),
}

function setupAuth(user: typeof mockUser | null = mockUser) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
}

describe('BarnsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuth()
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockActiveMembership])
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await BarnsPage().catch(() => {})

    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('should_redirect_to_login_with_no_barns_param_when_user_has_no_memberships', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])

    await BarnsPage().catch(() => {})

    expect(mockRedirect).toHaveBeenCalledWith('/login?no_barns=true')
  })

  it('should_render_barn_name_for_active_membership', async () => {
    const jsx = await BarnsPage()
    render(jsx)

    expect(screen.getByText('Green Acres')).toBeDefined()
  })

  it('should_render_link_to_barn_dashboard_for_active_membership', async () => {
    const jsx = await BarnsPage()
    render(jsx)

    const link = screen.getByRole('link', { name: /green acres/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres')
  })

  it('should_not_link_to_pending_page_for_active_membership', async () => {
    const jsx = await BarnsPage()
    render(jsx)

    const link = screen.getByRole('link', { name: /green acres/i })
    expect((link as HTMLAnchorElement).href).not.toContain('/pending')
  })

  it('should_render_capitalized_role_for_manager', async () => {
    const jsx = await BarnsPage()
    render(jsx)

    expect(screen.getByText('Manager')).toBeDefined()
  })

  it('should_render_capitalized_role_for_trainer', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      {
        ...mockActiveMembership,
        membership: { ...mockActiveMembership.membership, role: 'trainer' as const },
      },
    ])

    const jsx = await BarnsPage()
    render(jsx)

    expect(screen.getByText('Trainer')).toBeDefined()
  })

  it('should_render_capitalized_role_for_rider', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      {
        ...mockActiveMembership,
        membership: { ...mockActiveMembership.membership, role: 'rider' as const },
      },
    ])

    const jsx = await BarnsPage()
    render(jsx)

    expect(screen.getByText('Rider')).toBeDefined()
  })

  it('should_render_pending_approval_badge_for_pending_membership', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockPendingMembership])

    const jsx = await BarnsPage()
    render(jsx)

    expect(screen.getByText('Pending Approval')).toBeDefined()
  })

  it('should_render_link_to_pending_page_for_pending_membership', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockPendingMembership])

    const jsx = await BarnsPage()
    render(jsx)

    const link = screen.getByRole('link', { name: /sunset stables/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/sunset-stables/pending')
  })

  it('should_render_active_barn_name_when_mixed_memberships', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      mockActiveMembership,
      mockPendingMembership,
    ])

    const jsx = await BarnsPage()
    render(jsx)

    expect(screen.getByText('Green Acres')).toBeDefined()
  })

  it('should_render_pending_barn_name_when_mixed_memberships', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      mockActiveMembership,
      mockPendingMembership,
    ])

    const jsx = await BarnsPage()
    render(jsx)

    expect(screen.getByText('Sunset Stables')).toBeDefined()
  })

  it('should_render_pending_badge_when_mixed_memberships', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      mockActiveMembership,
      mockPendingMembership,
    ])

    const jsx = await BarnsPage()
    render(jsx)

    expect(screen.getByText('Pending Approval')).toBeDefined()
  })
})
