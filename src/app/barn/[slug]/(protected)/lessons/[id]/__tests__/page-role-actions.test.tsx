import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  getLessonById: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

vi.mock('@/app/actions/lessons', () => ({
  deleteLessonAction: vi.fn(),
}))

vi.mock('../../DeleteLessonButton', () => ({
  DeleteLessonButton: () => <div data-testid="delete-lesson-button" />,
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAuthenticatedUser } from '@/lib/db/auth'
import LessonDetailPage from '../page'
import { createMockBarn, createMockLessonDetail, createMockMembership, instant } from '@/test/fixtures'

const mockBarn = createMockBarn({
  created_at: '2026-01-01T00:00:00Z',
})

const mockLessonDetail = createMockLessonDetail({
  instructor_id: 'mem-1',
  fee: 75,
  lesson_at: instant('2026-05-17T10:00:00Z'),
  submitted_at: '2026-05-17T10:05:00Z',
  lesson_horses: [{ exertion_level: 3, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }],
  lesson_riders: [{ rider_notes: 'good position', private_notes: 'struggling with confidence', cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
})

const mockMembership = createMockMembership({
  created_at: '2026-01-01T00:00:00Z',
})

function mockSupabaseUser(userId = 'user-1') {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: userId } as any)
}

describe('LessonDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getLessonById).mockResolvedValue(mockLessonDetail)
    vi.mocked(getUserMembership).mockResolvedValue(mockMembership)
    mockSupabaseUser()
  })

  it('should_show_edit_link_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /edit/i })).toBeDefined()
  })

  it('should_edit_link_point_to_edit_page_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /edit/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/lessons/lesson-1/edit')
  })

  it('should_show_edit_link_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /edit/i })).toBeDefined()
  })

  it('should_edit_link_point_to_edit_page_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /edit/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/lessons/lesson-1/edit')
  })

  it('should_not_show_edit_link_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull()
  })

  it('should_not_show_edit_link_for_trainer_viewing_a_lesson_they_do_not_instruct', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, instructor_id: 'other-trainer-membership' })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /edit/i })).toBeNull()
  })

  it('should_show_header_cancel_link_for_manager_linking_to_cancel_page', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /^cancel$/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/lessons/lesson-1/cancel')
    expect(link.href).not.toContain('/cancel-rider/')
  })

  it('should_show_header_cancel_link_for_instructing_trainer_linking_to_cancel_page', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /^cancel$/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/lessons/lesson-1/cancel')
    expect(link.href).not.toContain('/cancel-rider/')
  })

  it('should_not_show_header_cancel_link_for_trainer_viewing_a_lesson_they_do_not_instruct', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, instructor_id: 'other-trainer-membership' })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /^cancel$/i })).toBeNull()
  })

  it('should_show_delete_button_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByTestId('delete-lesson-button')).toBeDefined()
  })

  it('should_show_delete_button_for_manager_on_an_already_cancelled_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, cancelled_at: '2026-01-01T00:00:00Z' })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByTestId('delete-lesson-button')).toBeDefined()
  })

  it('should_show_delete_confirmation_link_instead_of_delete_button_for_manager_on_a_paid_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: instant('2026-05-17T10:00:00Z'), payment_type: 'cash' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByTestId('delete-lesson-button')).toBeNull()
  })

  it('should_link_to_the_delete_confirmation_page_for_manager_on_a_paid_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: instant('2026-05-17T10:00:00Z'), payment_type: 'cash' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /delete/i }).getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1/delete')
  })

  it('should_show_bare_delete_button_for_manager_on_an_unpaid_past_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: instant('2026-05-17T10:00:00Z'), payment_type: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByTestId('delete-lesson-button')).toBeDefined()
  })

  it('should_link_to_the_delete_confirmation_page_for_manager_on_a_zero_fee_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: instant('2026-05-17T10:00:00Z'), fee: 0, payment_type: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /delete/i }).getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1/delete')
  })

  it('should_not_show_delete_button_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByTestId('delete-lesson-button')).toBeNull()
  })

  it('should_not_show_delete_button_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByTestId('delete-lesson-button')).toBeNull()
  })
})
