import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

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
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => '/barn/test-barn',
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getBarnMembershipsForUser: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfilesByUserIds: vi.fn(),
}))

vi.mock('@/lib/db/notifications', () => ({
  getNotifications: vi.fn(),
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import { getNotifications } from '@/lib/db/notifications'
import ProtectedBarnLayout, { generateMetadata } from '../layout'

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
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
}

const children = <div data-testid="child">content</div>
const params = Promise.resolve({ slug: 'green-acres' })

const mockProfile = {
  id: 'profile-1',
  user_id: 'user-1',
  email: 'user@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
  barn_id: null,
  role: null,
  created_at: '',
}

const mockMembershipEntry = { barn: mockBarn, membership: mockManagerMembership }

describe('ProtectedBarnLayout - auth guard', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockMembershipEntry])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([mockProfile])
    vi.mocked(getNotifications).mockResolvedValue([])
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
    vi.mocked(getAuthenticatedUser).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockMembershipEntry])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([mockProfile])
    vi.mocked(getNotifications).mockResolvedValue([])
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

  it('should_render_leases_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /leases/i })).toBeDefined()
  })

  it('should_render_leases_link_pointing_to_agreements_kind_lease_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /leases/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/agreements\?kind=lease$/)
  })

  it('should_render_boarding_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /boarding/i })).toBeDefined()
  })

  it('should_render_boarding_link_pointing_to_agreements_kind_board_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /boarding/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/agreements\?kind=board$/)
  })

  it('should_render_members_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /members/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/members$/)
  })

  it('should_render_finances_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('link', { name: /finances/i })).toBeDefined()
  })

  it('should_render_expenses_link_for_manager', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: 'Expenses' })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/expenses$/)
  })

  it('should_not_render_expenses_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: 'Expenses' })).toBeNull()
  })

  it('should_not_render_expenses_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: 'Expenses' })).toBeNull()
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

  it('should_render_members_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    const link = screen.getByRole('link', { name: /members/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/members$/)
  })

  it('should_not_render_members_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /members/i })).toBeNull()
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

  it('should_not_render_leases_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /leases/i })).toBeNull()
  })

  it('should_not_render_boarding_link_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /boarding/i })).toBeNull()
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

  it('should_not_render_leases_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /leases/i })).toBeNull()
  })

  it('should_not_render_boarding_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('link', { name: /boarding/i })).toBeNull()
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

describe('ProtectedBarnLayout - UserMenu', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockMembershipEntry])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([mockProfile])
    vi.mocked(getNotifications).mockResolvedValue([])
  })

  it('should_render_initials_from_profile_first_and_last_name', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('button', { name: /user menu/i }).textContent).toBe('JD')
  })

  it('should_render_email_initial_as_fallback_when_no_profile', async () => {
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('button', { name: /user menu/i }).textContent).toBe('U')
  })

  it('should_render_question_mark_when_no_profile_and_no_email', async () => {
    setupAuth({ id: 'user-1', email: null } as any)
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('button', { name: /user menu/i }).textContent).toBe('?')
  })

  it('should_show_barn_switcher_caret_when_user_has_multiple_active_memberships', async () => {
    const secondMembership = {
      barn: { id: 'barn-2', name: 'Other Barn', slug: 'other-barn', created_at: '' },
      membership: { ...mockManagerMembership, id: 'mem-2', barn_id: 'barn-2', status: 'active' as const },
    }
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockMembershipEntry, secondMembership])
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.getByRole('button', { name: /switch barn/i })).toBeDefined()
  })

  it('should_not_show_barn_switcher_caret_when_user_has_one_active_membership', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockMembershipEntry])
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('button', { name: /switch barn/i })).toBeNull()
  })

  it('should_not_show_barn_switcher_caret_when_second_membership_is_pending', async () => {
    const pendingMembership = {
      barn: { id: 'barn-2', name: 'Other Barn', slug: 'other-barn', created_at: '' },
      membership: { ...mockManagerMembership, id: 'mem-2', barn_id: 'barn-2', status: 'pending' as const },
    }
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockMembershipEntry, pendingMembership])
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByRole('button', { name: /switch barn/i })).toBeNull()
  })
})

describe('generateMetadata', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    mockNotFound.mockReset()
  })

  it('should_return_barn_name_and_site_name_as_title', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)

    const result = await generateMetadata({ params })

    expect(result.title).toBe('Green Acres | Stable State')
  })

  it('should_throw_not_found_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(generateMetadata({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('ProtectedBarnLayout - NotificationBell', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([mockMembershipEntry])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([mockProfile])
    vi.mocked(getNotifications).mockResolvedValue([])
  })

  it('should_fetch_notifications_for_user_and_barn', async () => {
    await ProtectedBarnLayout({ children, params })

    expect(getNotifications).toHaveBeenCalledWith('user-1', 'barn-1')
  })

  it('should_render_notification_bell', async () => {
    const jsx = await ProtectedBarnLayout({ children, params })
    render(jsx)

    expect(screen.getByRole('button', { name: /notifications/i })).toBeDefined()
  })
})
