import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getAdminMembership: vi.fn(),
}))

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import BarnDashboardPage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
const mockUser = { id: 'user-1', email: 'user@example.com' }

const mockManagerMembership = {
  id: 'mem-mgr',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'manager' as const,
  status: 'active' as const,
  created_at: '',
}

const mockTrainerMembership = {
  id: 'mem-trn',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'trainer' as const,
  status: 'active' as const,
  created_at: '',
}

const mockRiderMembership = {
  id: 'mem-rdr',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'rider' as const,
  status: 'active' as const,
  created_at: '',
}

const mockAdminMembership = {
  id: 'mem-adm',
  user_id: 'user-1',
  barn_id: null,
  role: 'admin' as const,
  status: 'active' as const,
  created_at: '',
}

function setupAuth(user: typeof mockUser | null = mockUser) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

describe('BarnDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      BarnDashboardPage({ params: Promise.resolve({ slug: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(
      BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(null)

    await expect(
      BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_pending_when_membership_is_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'pending',
    })

    await expect(
      BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
  })

  it('should_redirect_to_login_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'rejected' as any,
    })

    await expect(
      BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_lessons_link_for_manager', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /lessons/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/lessons')
  })

  it('should_render_lessons_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /lessons/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/lessons')
  })

  it('should_render_lessons_link_for_rider', async () => {
    // Rider has no distinct nav destination yet; falls through to the same Lessons link as trainer/manager.
    // Update this test when rider-specific pages are introduced.
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /lessons/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/lessons')
  })

  it('should_render_riders_link_for_manager', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /riders/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/riders')
  })

  it('should_render_approvals_link_for_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(mockAdminMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /approvals/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/approvals')
  })
})
