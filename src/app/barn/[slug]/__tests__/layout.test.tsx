import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
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

vi.mock('../DevRoleSwitcher', () => ({
  DevRoleSwitcher: ({ currentOverride }: { currentOverride: string | null }) => (
    <div data-testid="dev-role-switcher" data-override={currentOverride ?? 'none'} />
  ),
}))

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import BarnLayout from '../layout'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
const mockUser = { id: 'user-1', email: 'user@example.com' }

const mockManagerMembership = {
  id: 'mem-mgr',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'manager' as const,
  status: 'active' as const,
  created_at: '',
  default_fee: null,
}

const mockTrainerMembership = {
  id: 'mem-trn',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'trainer' as const,
  status: 'active' as const,
  created_at: '',
  default_fee: null,
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

describe('BarnLayout - outside development', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_render_children', async () => {
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('should_not_show_switcher_outside_development', async () => {
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByTestId('dev-role-switcher')).toBeNull()
  })
})

describe('BarnLayout - development mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    setupCookies()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('should_not_show_switcher_when_unauthenticated', async () => {
    setupAuth(null)
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByTestId('dev-role-switcher')).toBeNull()
  })

  it('should_not_show_switcher_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByTestId('dev-role-switcher')).toBeNull()
  })

  it('should_show_switcher_when_user_is_manager', async () => {
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher')).toBeDefined()
  })

  it('should_pass_null_override_when_no_cookie', async () => {
    setupCookies(undefined)
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher').getAttribute('data-override')).toBe('none')
  })

  it('should_pass_null_override_when_cookie_value_is_manager_role', async () => {
    setupCookies('manager')
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher').getAttribute('data-override')).toBe('none')
  })

  it('should_pass_valid_override_from_cookie', async () => {
    setupCookies('trainer')
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.getByTestId('dev-role-switcher').getAttribute('data-override')).toBe('trainer')
  })

  it('should_not_show_switcher_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(getUserMembership).mockResolvedValue(null)
    const jsx = await BarnLayout({ children, params })
    render(jsx)
    expect(screen.queryByTestId('dev-role-switcher')).toBeNull()
  })
})
