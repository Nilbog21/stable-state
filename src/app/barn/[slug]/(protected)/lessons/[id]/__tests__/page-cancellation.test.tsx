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

  it('should_hide_header_cancel_link_when_lesson_ineligible', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_at: instant('2026-05-17T10:00:00Z'),
      payment_type: 'cash' as const,
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /^cancel$/i })).toBeNull()
  })

  it('should_hide_cancelled_badge_for_ineligible_non_cancelled_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_at: instant('2026-05-17T10:00:00Z'),
      payment_type: 'cash' as const,
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Cancelled')).toBeNull()
  })

  it('should_show_exactly_one_header_cancel_link_for_manager_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: 'good position', private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: 'needs work', private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByRole('link', { name: /^cancel$/i })).toHaveLength(1)
  })

  it('should_show_cancelled_badge_next_to_cancelled_rider_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z' }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Cancelled')).toBeDefined()
  })

  it('should_not_show_any_cancel_link_when_whole_lesson_is_cancelled', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, cancelled_at: '2026-01-01T00:00:00Z' })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /^cancel$/i })).toBeNull()
  })

  it('should_show_cancel_link_for_own_participation_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /^cancel$/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/lessons/lesson-1/cancel-rider/rider-1')
  })

  it('should_show_cancelled_badge_for_own_cancelled_participation_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z' }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Cancelled')).toBeDefined()
  })

  it('should_not_show_cancel_link_for_rider_when_own_participation_already_cancelled', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z' }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /^cancel$/i })).toBeNull()
  })

  it('should_show_whole_lesson_cancelled_badge_when_lesson_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, cancelled_at: '2026-01-01T00:00:00Z' })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Cancelled')).toBeDefined()
  })

  it('should_not_show_whole_lesson_cancelled_badge_when_lesson_not_cancelled', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Cancelled')).toBeNull()
  })

  it('should_show_cancellation_notes_when_lesson_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      cancelled_at: '2026-01-01T00:00:00Z',
      cancellation_notes: 'Trainer unavailable',
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Trainer unavailable')).toBeDefined()
  })

  it('should_not_show_cancellation_notes_section_when_lesson_not_cancelled', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Cancellation Notes')).toBeNull()
  })

  it('should_hide_cancellation_notes_row_when_notes_is_null_even_if_lesson_cancelled', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      cancelled_at: '2026-01-01T00:00:00Z',
      cancellation_notes: null,
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Cancellation Notes')).toBeNull()
  })

  it('should_show_per_rider_cancellation_notes_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z', cancellation_notes: 'Rider called in sick' }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Rider called in sick')).toBeDefined()
  })

  it('should_show_own_cancellation_notes_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z', cancellation_notes: 'called in sick' }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('called in sick')).toBeDefined()
  })

  it('should_show_per_rider_cancellation_notes_for_manager_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z', cancellation_notes: 'Rider called in sick' }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Rider called in sick')).toBeDefined()
  })

  it('should_show_own_cancellation_notes_for_rider_role_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z', cancellation_notes: 'called in sick' }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('called in sick')).toBeDefined()
  })

  it('should_show_other_riders_cancellation_notes_for_rider_role_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        mockLessonDetail.lesson_riders[0],
        { rider_notes: 'needs work', private_notes: null, cancellation_notes: 'family emergency', cancelled_at: '2026-01-01T00:00:00Z', barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('family emergency')).toBeDefined()
  })

  it('should_not_show_other_riders_notes_when_not_cancelled_for_rider_role_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        mockLessonDetail.lesson_riders[0],
        { rider_notes: 'needs work', private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('needs work')).toBeNull()
  })

  it('should_hide_per_rider_cancellation_notes_label_when_null_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z', cancellation_notes: null }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Cancellation Notes')).toBeNull()
  })

  it('should_hide_own_cancellation_notes_label_when_null_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [{ ...mockLessonDetail.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z', cancellation_notes: null }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Cancellation Notes')).toBeNull()
  })

  it('should_render_cancellation_notes_as_text_for_manager_on_cancelled_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      cancelled_at: '2026-01-01T00:00:00Z',
      cancellation_notes: 'weather',
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('weather')).toBeDefined()
  })

  it('should_not_render_editable_cancellation_notes_field_for_manager_on_cancelled_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      cancelled_at: '2026-01-01T00:00:00Z',
      cancellation_notes: 'weather',
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('should_render_readonly_cancellation_notes_for_rider_on_cancelled_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      cancelled_at: '2026-01-01T00:00:00Z',
      cancellation_notes: 'weather',
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('should_hide_cancellation_notes_row_for_rider_when_lesson_cancellation_notes_is_null', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      cancelled_at: '2026-01-01T00:00:00Z',
      cancellation_notes: null,
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Cancellation Notes')).toBeNull()
  })
})
