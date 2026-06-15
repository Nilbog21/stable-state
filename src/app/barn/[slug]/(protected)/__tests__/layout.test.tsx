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

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/effective-membership', () => ({
  getEffectiveMembership: vi.fn(),
}))

vi.mock('../../DevRoleSwitcher', () => ({
  DevRoleSwitcher: ({ currentOverride }: { currentOverride: string | null }) => (
    <div data-testid="dev-role-switcher" data-override={currentOverride ?? 'none'} />
  ),
}))

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
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

function setupCookies(value?: string) {
  const cookieStore = { get: vi.fn().mockReturnValue(value ? { value } : undefined) }
  vi.mocked(cookies).mockResolvedValue(cookieStore as any)
}

const children = <div data-testid="child">content</div>
const params = Promise.resolve({ slug: 'green-acres' })

describe('ProtectedBarnLayout - auth guard', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockManagerMembership)
    setupCookies()
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
    vi.mocked(getEffectiveMembership).mockResolvedValue(null)

    await expect(ProtectedBarnLayout({ children, params })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_no_membership', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(null)

    try { await ProtectedBarnLayout({ children, params }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_throw_when_membership_is_pending', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'pending',
    })

    await expect(ProtectedBarnLayout({ children, params })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_pending_when_membership_is_pending', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'pending',
    })

    try { await ProtectedBarnLayout({ children, params }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
  })

  it('should_throw_when_membership_is_not_active', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'rejected' as any,
    })

    await expect(ProtectedBarnLayout({ children, params })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_membership_is_not_active', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({
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
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockManagerMembership)
    setupCookies()
  })

  it('should_render_children', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('should_render_dashboard_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /dashboard/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres')
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

  it('should_render_horses_overview_link_pointing_to_overview_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Horses' }) as HTMLAnchorElement).href).toContain('/horses/overview')
  })

  it('should_render_manage_horses_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: 'Manage Horses' })).toBeDefined()
  })

  it('should_render_manage_horses_link_pointing_to_horses_page_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Manage Horses' }) as HTMLAnchorElement).href).toContain('/barn/green-acres/horses')
  })

  it('should_render_manage_horses_link_before_settings_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const links = screen.getAllByRole('link')
    const manageHorsesIdx = links.findIndex((l) => l.textContent === 'Manage Horses')
    const settingsIdx = links.findIndex((l) => l.textContent === 'Settings')
    expect(manageHorsesIdx).toBeLessThan(settingsIdx)
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

  it('should_render_approvals_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /approvals/i })).toBeDefined()
  })

  it('should_render_settings_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /settings/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/settings')
  })

  it('should_not_render_settings_link_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /settings/i })).toBeNull()
  })

  it('should_not_render_settings_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /settings/i })).toBeNull()
  })

  it('should_render_dashboard_link_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /dashboard/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres')
  })

  it('should_render_lessons_link_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /lessons/i })).toBeDefined()
  })

  it('should_render_riders_link_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /riders/i })).toBeDefined()
  })

  it('should_render_horses_overview_link_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: 'Horses' })).toBeDefined()
  })

  it('should_render_horses_overview_link_pointing_to_overview_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Horses' }) as HTMLAnchorElement).href).toContain('/horses/overview')
  })

  it('should_not_render_manage_horses_link_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: 'Manage Horses' })).toBeNull()
  })

  it('should_not_render_finances_link_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /finances/i })).toBeNull()
  })

  it('should_not_render_approvals_link_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /approvals/i })).toBeNull()
  })

  it('should_render_dashboard_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /dashboard/i })
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres')
  })

  it('should_render_lessons_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /lessons/i })).toBeDefined()
  })

  it('should_render_horses_overview_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: 'Horses' })).toBeDefined()
  })

  it('should_render_horses_overview_link_pointing_to_overview_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect((screen.getByRole('link', { name: 'Horses' }) as HTMLAnchorElement).href).toContain('/horses/overview')
  })

  it('should_not_render_manage_horses_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: 'Manage Horses' })).toBeNull()
  })

  it('should_not_render_finances_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /finances/i })).toBeNull()
  })

  it('should_not_render_approvals_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /approvals/i })).toBeNull()
  })
})

describe('ProtectedBarnLayout - DevRoleSwitcher outside development', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockManagerMembership)
    setupCookies()
  })

  it('should_not_show_switcher_outside_development', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByTestId('dev-role-switcher')).toBeNull()
  })
})

describe('ProtectedBarnLayout - DevRoleSwitcher in development mode', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.stubEnv('NODE_ENV', 'development')
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockManagerMembership)
    setupCookies()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should_not_show_switcher_when_user_is_not_manager_in_dev_mode', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByTestId('dev-role-switcher')).toBeNull()
  })

  it('should_show_switcher_when_user_is_manager_in_dev_mode', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher')).toBeDefined()
  })

  it('should_show_switcher_when_manager_has_active_override', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({
      id: 'dev-override',
      user_id: 'user-1',
      barn_id: 'barn-1',
      role: 'trainer' as const,
      status: 'active' as const,
      created_at: '',
    })
    setupCookies('trainer')
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher')).toBeDefined()
  })

  it('should_pass_null_override_when_no_cookie', async () => {
    setupCookies(undefined)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher').getAttribute('data-override')).toBe('none')
  })

  it('should_pass_null_override_when_cookie_value_is_manager_role', async () => {
    setupCookies('manager')
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher').getAttribute('data-override')).toBe('none')
  })

  it('should_pass_valid_override_from_cookie', async () => {
    setupCookies('trainer')
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher').getAttribute('data-override')).toBe('trainer')
  })
})
