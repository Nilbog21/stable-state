import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile } from '@/test/fixtures'

afterEach(cleanup)

const mockHeaders = vi.hoisted(() => vi.fn())

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getBarnMembershipsForUser: vi.fn(),
  getUserMembership: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfilesByUserIds: vi.fn(),
}))

vi.mock('@/lib/db/notifications', () => ({
  getNotifications: vi.fn(),
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
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => '/profile',
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className, onNavigate, 'aria-current': ariaCurrent }: {
    href: string
    children: React.ReactNode
    className?: string
    onNavigate?: (e: { preventDefault: () => void }) => void
    'aria-current'?: 'page'
  }) => (
    <a
      href={href}
      className={className}
      aria-current={ariaCurrent}
      onClick={(e) => onNavigate?.({ preventDefault: () => e.preventDefault() })}
    >
      {children}
    </a>
  ),
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnMembershipsForUser, getUserMembership } from '@/lib/db/barn-memberships'
import { getBarnBySlug } from '@/lib/db/barns'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import { getNotifications } from '@/lib/db/notifications'
import ProfileLayout from '../layout'

const mockUser = { id: 'user-1', email: 'user@example.com' }
const mockBarn = createMockBarn({ slug: 'green-acres', name: 'Green Acres' })
const mockManagerMembership = createMockMembership({ status: 'active', role: 'manager' as const })
const mockTrainerMembership = createMockMembership({ status: 'active', role: 'trainer' as const })
const mockRiderMembership = createMockMembership({ status: 'active', role: 'rider' as const })
const mockProfile = createMockProfile({ id: 'p-1', user_id: 'user-1', email: 'user@example.com', first_name: 'Jane', last_name: 'Doe', phone: null, emergency_contact_name: null, emergency_contact_phone: null, created_at: '' })

function makeHeaders(url: string) {
  return { get: (key: string) => key === 'x-url' ? url : null }
}

function mockAuth(user: typeof mockUser | null) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
}

function setupBarnNav(role: typeof mockManagerMembership = mockManagerMembership) {
  mockHeaders.mockResolvedValue(makeHeaders('http://localhost/profile?barn=green-acres'))
  vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
  vi.mocked(getUserMembership).mockResolvedValue(role)
  vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
    { barn: mockBarn, membership: role },
  ])
  vi.mocked(getProfilesByUserIds).mockResolvedValue([mockProfile])
  vi.mocked(getNotifications).mockResolvedValue([])
}

describe('ProfileLayout - auth', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    mockHeaders.mockResolvedValue(makeHeaders('http://localhost/profile'))
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
  })

  it('should_redirect_to_login_when_not_authenticated', async () => {
    mockAuth(null)
    await expect(ProfileLayout({ children: <span>child</span> })).rejects.toMatchObject({
      digest: expect.stringContaining('/login'),
    })
  })
})

describe('ProfileLayout - back-button nav (no barn param)', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    mockRedirect.mockClear()
    mockAuth(mockUser)
    mockHeaders.mockResolvedValue(makeHeaders('http://localhost/profile'))
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(getUserMembership).mockResolvedValue(null)
  })

  it('should_render_back_link_when_x_url_header_is_absent', async () => {
    mockHeaders.mockResolvedValue({ get: () => null })
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
    ])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('link', { name: /back/i })).toBeDefined()
  })

  it('should_render_back_link_to_barn_slug_when_user_has_one_active_membership', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
    ])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    const link = screen.getByRole('link', { name: /back/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres')
  })

  it('should_render_back_link_to_barns_when_user_has_multiple_active_memberships', async () => {
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
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    const link = screen.getByRole('link', { name: /back/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barns')
  })
})

describe('ProfileLayout - back-button fallback (barn param but lookup fails)', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    mockRedirect.mockClear()
    mockAuth(mockUser)
    mockHeaders.mockResolvedValue(makeHeaders('http://localhost/profile?barn=green-acres'))
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
    ])
  })

  it('should_render_back_link_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('link', { name: /back/i })).toBeDefined()
  })

  it('should_render_back_link_when_membership_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(null)
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('link', { name: /back/i })).toBeDefined()
  })

  it('should_render_back_link_when_membership_is_pending', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('link', { name: /back/i })).toBeDefined()
  })
})

describe('ProfileLayout - barn nav (valid barn param + active membership)', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    mockRedirect.mockClear()
    mockAuth(mockUser)
    setupBarnNav()
  })

  it('should_render_barn_name_as_home_link', async () => {
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect((screen.getByRole('link', { name: 'Green Acres' }) as HTMLAnchorElement).href).toContain('/barn/green-acres')
  })

  it('should_render_hamburger_menu_button_in_barn_nav', async () => {
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toBeDefined()
  })

  it('should_not_render_back_link_in_barn_nav', async () => {
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.queryByRole('link', { name: /back/i })).toBeNull()
  })

  it('should_render_lessons_link_for_manager', async () => {
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('link', { name: /lessons/i })).toBeDefined()
  })

  it('should_render_manage_barn_link_for_manager', async () => {
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('link', { name: /manage barn/i })).toBeDefined()
  })

  it('should_not_render_manage_barn_link_for_trainer', async () => {
    setupBarnNav(mockTrainerMembership)
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.queryByRole('link', { name: /manage barn/i })).toBeNull()
  })

  it('should_not_render_manage_barn_link_for_rider', async () => {
    setupBarnNav(mockRiderMembership)
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.queryByRole('link', { name: /manage barn/i })).toBeNull()
  })

  it('should_not_render_members_link_for_rider', async () => {
    setupBarnNav(mockRiderMembership)
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.queryByRole('link', { name: /members/i })).toBeNull()
  })

  it('should_render_user_menu_button', async () => {
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('button', { name: /user menu/i })).toBeDefined()
  })

  it('should_render_notification_bell', async () => {
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('button', { name: /notifications/i })).toBeDefined()
  })

  it('should_fetch_notifications_for_user_and_barn', async () => {
    await ProfileLayout({ children: <span>child</span> })
    expect(getNotifications).toHaveBeenCalledWith('user-1', mockBarn.id)
  })

  it('should_render_initials_from_profile', async () => {
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('button', { name: /user menu/i }).textContent).toBe('JD')
  })

  it('should_render_children', async () => {
    const jsx = await ProfileLayout({ children: <div data-testid="child">content</div> })
    render(jsx as React.ReactElement)
    expect(screen.getByTestId('child')).toBeDefined()
  })
})

describe('ProfileLayout - barn nav initials fallback', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    mockAuth(mockUser)
    mockHeaders.mockResolvedValue(makeHeaders('http://localhost/profile?barn=green-acres'))
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([{ barn: mockBarn, membership: mockManagerMembership }])
    vi.mocked(getNotifications).mockResolvedValue([])
  })

  it('should_render_email_initial_when_no_profile_in_barn_nav', async () => {
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('button', { name: /user menu/i }).textContent).toBe('U')
  })

  it('should_render_question_mark_when_no_profile_and_no_email_in_barn_nav', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1', email: null } as any)
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    expect(screen.getByRole('button', { name: /user menu/i }).textContent).toBe('?')
  })
})

describe('ProfileLayout - barn nav UserMenu shows switch barn', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    mockAuth(mockUser)
    mockHeaders.mockResolvedValue(makeHeaders('http://localhost/profile?barn=green-acres'))
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getProfilesByUserIds).mockResolvedValue([mockProfile])
    vi.mocked(getNotifications).mockResolvedValue([])
  })

  it('should_show_switch_barn_when_multiple_active_memberships', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: mockBarn, membership: mockManagerMembership },
      { barn: createMockBarn({ id: 'barn-2', slug: 'barn-2' }), membership: createMockMembership({ id: 'mem-2', barn_id: 'barn-2', status: 'active' }) },
    ])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.getByRole('link', { name: /switch barn/i })).toBeDefined()
  })

  it('should_not_show_switch_barn_when_one_active_membership', async () => {
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: mockBarn, membership: mockManagerMembership },
    ])
    const jsx = await ProfileLayout({ children: <span>child</span> })
    render(jsx as React.ReactElement)
    fireEvent.click(screen.getByRole('button', { name: /user menu/i }))
    expect(screen.queryByRole('link', { name: /switch barn/i })).toBeNull()
  })
})
