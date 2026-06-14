import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/effective-membership', () => ({
  getEffectiveMembership: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  getUpcomingLessons: vi.fn(),
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
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getUpcomingLessons } from '@/lib/db/lessons'
import { createMockLesson } from '@/test/fixtures'
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
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getUpcomingLessons).mockResolvedValue([])
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
    vi.mocked(getEffectiveMembership).mockResolvedValue(null)

    await expect(
      BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_pending_when_membership_is_pending', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({
      ...mockManagerMembership,
      status: 'pending',
    })

    await expect(
      BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
  })

  it('should_redirect_to_login_when_membership_is_not_active', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue({
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
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /lessons/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/lessons')
  })

  it('should_render_lessons_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /lessons/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/lessons')
  })

  it('should_not_render_riders_link_for_rider', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockRiderMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.queryByRole('link', { name: /riders/i })).toBeNull()
  })

  it('should_render_riders_link_for_manager', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /riders/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/riders')
  })

  it('should_render_approvals_link_for_manager', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /approvals/i })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/barn/green-acres/approvals')
  })

  it('should_render_five_nav_links_for_manager', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const horses = screen.getByRole('link', { name: /horses/i })
    const lessons = screen.getByRole('link', { name: /lessons/i })
    const finances = screen.getByRole('link', { name: /finances/i })
    const riders = screen.getByRole('link', { name: /riders/i })
    const approvals = screen.getByRole('link', { name: /approvals/i })

    expect((horses as HTMLAnchorElement).href).toContain('/barn/green-acres/horses')
    expect((lessons as HTMLAnchorElement).href).toContain('/barn/green-acres/lessons')
    expect((finances as HTMLAnchorElement).href).toContain('/barn/green-acres/finances')
    expect((riders as HTMLAnchorElement).href).toContain('/barn/green-acres/riders')
    expect((approvals as HTMLAnchorElement).href).toContain('/barn/green-acres/approvals')
  })

  it('should_show_upcoming_lessons_section_for_manager', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByRole('heading', { name: /upcoming lessons/i })).toBeDefined()
  })

  it('should_show_empty_state_when_no_upcoming_lessons', async () => {
    vi.mocked(getUpcomingLessons).mockResolvedValue([])

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByText('No upcoming lessons this week')).toBeDefined()
  })

  it('should_show_lesson_horse_names_and_rider_for_manager', async () => {
    const lesson = {
      ...createMockLesson(),
      instructor_name: null,
      horse_names: ['Thunderbolt'],
      horse_count: 1,
      rider_names: ['Alice'],
      rider_count: 1,
    }
    vi.mocked(getUpcomingLessons).mockResolvedValue([lesson])

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByText('Thunderbolt')).toBeDefined()
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_show_instructor_name_when_present', async () => {
    const lesson = {
      ...createMockLesson(),
      instructor_name: 'Jane Smith',
      horse_names: [],
      horse_count: 0,
      rider_names: [],
      rider_count: 0,
    }
    vi.mocked(getUpcomingLessons).mockResolvedValue([lesson])

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByText('Jane Smith')).toBeDefined()
  })

  it('should_not_show_upcoming_lessons_section_for_trainer', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(mockTrainerMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.queryByText(/upcoming lessons/i)).toBeNull()
  })

})
