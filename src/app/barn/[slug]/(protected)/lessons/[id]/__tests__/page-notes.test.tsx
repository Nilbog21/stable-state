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

  it('should_show_jumping_badge_when_lesson_is_jumping', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, jumping: true })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Jumping')).toBeDefined()
  })

  it('should_not_show_jumping_badge_when_lesson_is_not_jumping', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Jumping')).toBeNull()
  })

  it('should_show_horse_notes_inline_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('watch left lead')).toBeDefined()
  })

  it('should_show_horse_notes_inline_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('watch left lead')).toBeDefined()
  })

  it('should_not_show_horse_notes_for_rider_when_exertion_level_is_undefined', async () => {
    // #999: horse_notes visibility now follows the same per-horse privilege signal as
    // exertion (an undefined exertion_level means "not privileged for this horse").
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: undefined, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('watch left lead')).toBeNull()
  })

  it('should_show_horse_notes_for_rider_when_exertion_level_is_defined', async () => {
    // #999: a rider-owner with lesson_read_privileges sees their own horse's notes.
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('watch left lead')).toBeDefined()
  })

  it('should_show_rider_notes_inline_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('good position')).toBeDefined()
  })

  it('should_show_rider_notes_inline_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('good position')).toBeDefined()
  })

  it('should_show_private_notes_inline_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('struggling with confidence')).toBeDefined()
  })

  it('should_show_private_notes_inline_for_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('struggling with confidence')).toBeDefined()
  })

  it('should_not_render_any_notes_textareas_on_detail_page', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryAllByRole('textbox').length).toBe(0)
  })

  it('should_show_private_label_for_trainer', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Private')).toBeDefined()
  })

  it('should_hide_rider_notes_label_when_rider_notes_is_null_for_trainer', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ rider_notes: null, private_notes: 'struggling with confidence', cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Rider Notes')).toBeNull()
  })

  it('should_hide_private_notes_label_when_private_notes_is_null_for_trainer', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ rider_notes: 'good position', private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Private')).toBeNull()
  })

  it('should_not_render_notes_wrapper_when_rider_has_no_notes_at_all_for_trainer', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    const { container } = render(jsx)
    expect(container.querySelector('.mt-1.flex.flex-col.gap-1')).toBeNull()
  })

  it('should_show_rider_own_notes_readonly_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('good position')).toBeDefined()
  })

  it('should_not_show_private_notes_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('struggling with confidence')).toBeNull()
  })

  it('should_not_show_other_riders_notes_for_rider_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
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
    expect(screen.queryByText('needs work')).toBeNull()
  })

  it('should_show_own_notes_for_rider_in_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
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
    expect(screen.getByText('good position')).toBeDefined()
  })

  it('should_render_dash_for_null_rider_name_in_group_lesson_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: null },
        { rider_notes: 'good position', private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_for_null_rider_name_in_normal_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'normal' as const,
      lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: null }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
