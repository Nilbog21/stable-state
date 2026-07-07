import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('../UpcomingLessonsSections', () => ({
  UpcomingLessonsSections: ({ lessons, expenses, role, slug, viewerMembershipId }: { lessons: { id: string }[]; expenses?: { id: string }[]; role: string; slug: string; viewerMembershipId?: string }) => (
    <div data-testid="upcoming-sections" data-role={role} data-slug={slug} data-lesson-count={lessons.length} data-expense-count={(expenses ?? []).length} data-viewer-membership-id={viewerMembershipId} />
  ),
}))

vi.mock('../DocumentRemindersSection', () => ({
  DocumentRemindersSection: ({ slug, dueDocuments }: { slug: string; dueDocuments: { id: string }[] }) => (
    <div data-testid="document-reminders" data-slug={slug} data-due-count={dueDocuments.length} />
  ),
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getPendingMemberships: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  getUpcomingLessons: vi.fn(),
}))

vi.mock('@/lib/db/documents', () => ({
  getDueDocuments: vi.fn(),
}))

vi.mock('@/lib/db/expenses', () => ({
  getUpcomingScheduledExpenses: vi.fn(),
}))

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  })
)

vi.mock('next/navigation', () => ({
  notFound: mockNotFound,
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getUpcomingLessons } from '@/lib/db/lessons'
import { getPendingMemberships } from '@/lib/db/barn-memberships'
import { getDueDocuments } from '@/lib/db/documents'
import { getUpcomingScheduledExpenses } from '@/lib/db/expenses'
import { createMockLesson, createMockExpenseWithHorses } from '@/test/fixtures'
import BarnDashboardPage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', instructor_cut: 25, created_at: '' }
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

describe('BarnDashboardPage', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getUpcomingLessons).mockResolvedValue([])
    vi.mocked(getPendingMemberships).mockResolvedValue([])
    vi.mocked(getDueDocuments).mockReset()
    vi.mocked(getDueDocuments).mockResolvedValue([])
    vi.mocked(getUpcomingScheduledExpenses).mockReset()
    vi.mocked(getUpcomingScheduledExpenses).mockResolvedValue([])
  })

  it('should_throw_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      BarnDashboardPage({ params: Promise.resolve({ slug: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    try { await BarnDashboardPage({ params: Promise.resolve({ slug: 'unknown' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_dashboard_heading', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Dashboard')
  })

  it('should_render_upcoming_lessons_sections_for_manager', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('upcoming-sections').getAttribute('data-role')).toBe('manager')
  })

  it('should_render_upcoming_lessons_sections_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('upcoming-sections').getAttribute('data-role')).toBe('trainer')
  })

  it('should_render_upcoming_lessons_sections_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('upcoming-sections').getAttribute('data-role')).toBe('rider')
  })

  it('should_pass_lesson_count_to_upcoming_lessons_sections', async () => {
    const lesson = {
      ...createMockLesson(),
      instructor_name: null,
      horse_names: [],
      horse_count: 0,
      rider_names: [],
      rider_count: 0,
    }
    vi.mocked(getUpcomingLessons).mockResolvedValue([lesson])

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('upcoming-sections').getAttribute('data-lesson-count')).toBe('1')
  })

  it('should_pass_slug_to_upcoming_lessons_sections', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('upcoming-sections').getAttribute('data-slug')).toBe('green-acres')
  })

  it('should_call_getUpcomingLessons_with_user_id', async () => {
    await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(vi.mocked(getUpcomingLessons)).toHaveBeenCalledWith(
      mockBarn.id,
      expect.any(String),
      expect.any(String),
      mockUser.id,
      expect.any(String)
    )
  })

  it('should_call_getUpcomingLessons_with_membership_role', async () => {
    await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(vi.mocked(getUpcomingLessons)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      mockManagerMembership.role
    )
  })

  it('should_not_render_sign_out_button', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
  })

  it('should_render_pending_approvals_badge_when_count_is_nonzero', async () => {
    vi.mocked(getPendingMemberships).mockResolvedValue([
      { id: 'p1', user_id: 'u1', barn_id: 'barn-1', role: 'rider', status: 'pending', created_at: '' },
    ] as any)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByText(/pending request/i)).toBeDefined()
  })

  it('should_not_render_pending_approvals_badge_when_count_is_zero', async () => {
    vi.mocked(getPendingMemberships).mockResolvedValue([])

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.queryByText(/pending request/i)).toBeNull()
  })

  it('should_render_pending_approvals_badge_with_link_to_settings', async () => {
    vi.mocked(getPendingMemberships).mockResolvedValue([
      { id: 'p1', user_id: 'u1', barn_id: 'barn-1', role: 'rider', status: 'pending', created_at: '' },
    ] as any)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const link = screen.getByRole('link', { name: /pending request/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/settings')
  })

  it('should_not_render_pending_approvals_badge_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.queryByText(/pending request/i)).toBeNull()
  })

  it('should_pass_viewer_membership_id_to_upcoming_lessons_sections', async () => {
    const lesson = {
      ...createMockLesson(),
      instructor_name: null,
      horse_names: [],
      horse_count: 0,
      rider_names: [],
      rider_count: 0,
    }
    vi.mocked(getUpcomingLessons).mockResolvedValue([lesson])

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('upcoming-sections').getAttribute('data-viewer-membership-id')).toBe(mockManagerMembership.id)
  })

  it('should_use_plural_pending_requests_when_count_is_greater_than_one', async () => {
    vi.mocked(getPendingMemberships).mockResolvedValue([
      { id: 'p1', user_id: 'u1', barn_id: 'barn-1', role: 'rider', status: 'pending', created_at: '' },
      { id: 'p2', user_id: 'u2', barn_id: 'barn-1', role: 'rider', status: 'pending', created_at: '' },
    ] as any)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByText(/2 pending requests/i)).toBeDefined()
  })

  const mockDueHorseDoc = {
    id: 'doc-1',
    entity: 'horse' as const,
    recordType: 'coggins',
    fileName: 'coggins.pdf',
    reminderDate: '2026-01-01',
    ownerName: 'Thunderbolt',
    ownerId: 'horse-1',
  }

  it('should_pass_due_documents_to_document_reminders_section', async () => {
    vi.mocked(getDueDocuments).mockResolvedValue([mockDueHorseDoc])

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('document-reminders').getAttribute('data-due-count')).toBe('1')
  })

  it('should_pass_slug_to_document_reminders_section', async () => {
    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('document-reminders').getAttribute('data-slug')).toBe('green-acres')
  })

  it('should_not_call_getDueDocuments_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(getDueDocuments).not.toHaveBeenCalled()
  })

  it('should_not_call_getDueDocuments_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(getDueDocuments).not.toHaveBeenCalled()
  })

  it('should_pass_expense_count_to_upcoming_lessons_sections_for_manager', async () => {
    vi.mocked(getUpcomingScheduledExpenses).mockResolvedValue([createMockExpenseWithHorses({ expense_time: '10:00:00' })] as any)

    const jsx = await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByTestId('upcoming-sections').getAttribute('data-expense-count')).toBe('1')
  })

  it('should_not_call_getUpcomingScheduledExpenses_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)

    await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(getUpcomingScheduledExpenses).not.toHaveBeenCalled()
  })

  it('should_not_call_getUpcomingScheduledExpenses_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockRiderMembership)

    await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(getUpcomingScheduledExpenses).not.toHaveBeenCalled()
  })

  it('should_call_getUpcomingScheduledExpenses_with_barn_id_for_manager', async () => {
    await BarnDashboardPage({ params: Promise.resolve({ slug: 'green-acres' }) })

    expect(getUpcomingScheduledExpenses).toHaveBeenCalledWith(mockBarn.id, expect.any(String), expect.any(String))
  })
})
