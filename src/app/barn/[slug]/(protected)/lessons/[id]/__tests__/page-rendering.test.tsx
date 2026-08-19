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

  it('should_render_date_instructor_horse_exertion_rider_and_fee', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText(/may 17, 2026/i)).toBeDefined()
    expect(screen.getByText(/jane smith/i)).toBeDefined()
    expect(screen.getByText(/thunderbolt/i)).toBeDefined()
    expect(screen.getByText(/exertion 3/i)).toBeDefined()
    expect(screen.getByText(/alice/i)).toBeDefined()
    expect(screen.getByText(/\$75/)).toBeDefined()
  })

  it('should_render_the_lesson_time_in_the_barns_timezone_not_utc', async () => {
    // 2026-05-17T10:00:00Z is 6:00 AM EDT (UTC-4) — a naive UTC-timeZone
    // formatter would show 10:00 AM instead.
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText(/6:00 am/i)).toBeDefined()
  })

  it('should_render_dash_when_instructor_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, instructor_name: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_for_null_horse_name_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: null }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_not_render_exertion_for_rider_role_when_exertion_level_is_undefined', async () => {
    // #999: getLessonById only returns a defined exertion_level for a horse the caller
    // is privileged for (or any horse, for manager/trainer) -- an undefined value here
    // is what "not privileged for this horse" looks like from the page's perspective.
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: undefined, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText(/exertion/i)).toBeNull()
  })

  it('should_render_exertion_for_rider_role_when_exertion_level_is_defined', async () => {
    // #999: a rider-owner with lesson_read_privileges sees their own horse's exertion.
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText(/exertion 3/i)).toBeDefined()
  })

  it('should_render_dash_in_horses_section_when_lesson_has_no_horses', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_horses: [] })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_for_horse_name_when_horses_relation_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: null }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_in_riders_section_when_lesson_has_no_riders', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_riders: [] })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_render_dash_for_rider_name_when_riders_relation_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: null }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_show_group_badge_for_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_type: 'group' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Group')).toBeDefined()
  })

  it('should_show_normal_badge_for_normal_lesson', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Normal')).toBeDefined()
  })

  it('should_show_recurring_badge_when_lesson_has_series_id', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, series_id: 'series-1' })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Recurring')).toBeDefined()
  })

  it('should_not_show_recurring_badge_when_series_id_null', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Recurring')).toBeNull()
  })

  it('should_show_rider_names_for_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('should_render_riders_as_list_items_for_group_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const listItems = screen.getAllByRole('listitem')
    const riderItems = listItems.filter((li) => li.textContent?.includes('Alice') || li.textContent?.includes('Bob'))
    expect(riderItems.length).toBe(2)
  })

  it('should_render_dash_for_null_rider_in_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: null },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_show_name_for_non_null_rider_when_other_rider_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: null },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('should_render_dash_in_riders_section_when_group_lesson_has_no_riders', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_type: 'group' as const,
      lesson_riders: [],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('should_show_rider_name_inline_for_normal_lesson', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_not_render_rider_names_as_list_items_for_normal_lesson', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    const listItems = screen.queryAllByRole('listitem')
    const riderItems = listItems.filter((li) => li.textContent === 'Alice')
    expect(riderItems.length).toBe(0)
  })
})
