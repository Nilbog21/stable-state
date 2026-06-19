import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import ProtectedBarnLayout from '../layout'

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

function setupAuth(user: typeof mockUser | null = mockUser) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

const children = <div data-testid="child">content</div>
const params = Promise.resolve({ slug: 'green-acres' })

describe('ProtectedBarnLayout - auth guard', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
  })

  it('should_throw_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(ProtectedBarnLayout({ children, params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    try { await ProtectedBarnLayout({ children, params }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_throw_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(ProtectedBarnLayout({ children, params })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    try { await ProtectedBarnLayout({ children, params }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_throw_when_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    await expect(ProtectedBarnLayout({ children, params })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    try { await ProtectedBarnLayout({ children, params }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_throw_when_membership_is_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'pending',
    })

    await expect(ProtectedBarnLayout({ children, params })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_pending_when_membership_is_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'pending',
    })

    try { await ProtectedBarnLayout({ children, params }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
  })

  it('should_throw_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'rejected' as any,
    })

    await expect(ProtectedBarnLayout({ children, params })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'rejected' as any,
    })

    try { await ProtectedBarnLayout({ children, params }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })
})

describe('ProtectedBarnLayout - nav links', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
  })

  it('should_render_children', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('should_render_barn_name_as_home_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Green Acres' }) as HTMLAnchorElement).href).toContain('/barn/green-acres')
  })

  it('should_render_lessons_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /lessons/i })).toBeDefined()
  })

  it('should_render_horses_overview_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: 'Horses' })).toBeDefined()
  })

  it('should_render_horses_link_pointing_to_horses_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Horses' }) as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/horses$/)
  })

  it('should_not_render_manage_horses_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: 'Manage Horses' })).toBeNull()
  })

  it('should_render_riders_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /riders/i })).toBeDefined()
  })

  it('should_render_finances_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /finances/i })).toBeDefined()
  })

  it('should_not_render_approvals_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /approvals/i })).toBeNull()
  })

  it('should_render_manage_barn_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /manage barn/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/settings')
  })

  it('should_not_render_settings_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /manage barn/i })).toBeNull()
  })

  it('should_not_render_settings_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /manage barn/i })).toBeNull()
  })

  it('should_render_dashboard_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Green Acres' }) as HTMLAnchorElement).href).toContain('/barn/green-acres')
  })

  it('should_render_lessons_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /lessons/i })).toBeDefined()
  })

  it('should_render_riders_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /riders/i })).toBeDefined()
  })

  it('should_render_horses_overview_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: 'Horses' })).toBeDefined()
  })

  it('should_render_horses_link_pointing_to_horses_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Horses' }) as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/horses$/)
  })

  it('should_not_render_manage_horses_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: 'Manage Horses' })).toBeNull()
  })

  it('should_not_render_finances_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /finances/i })).toBeNull()
  })

  it('should_not_render_approvals_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /approvals/i })).toBeNull()
  })

  it('should_render_dashboard_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Green Acres' }) as HTMLAnchorElement).href).toContain('/barn/green-acres')
  })

  it('should_render_lessons_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /lessons/i })).toBeDefined()
  })

  it('should_render_horses_overview_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: 'Horses' })).toBeDefined()
  })

  it('should_render_horses_link_pointing_to_horses_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Horses' }) as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/horses$/)
  })

  it('should_not_render_manage_horses_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: 'Manage Horses' })).toBeNull()
  })

  it('should_not_render_finances_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /finances/i })).toBeNull()
  })

  it('should_not_render_approvals_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /approvals/i })).toBeNull()
  })
})
