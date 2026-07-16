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
import { notFound } from 'next/navigation'
import LessonDetailPage from '../page'
import { createMockBarn, createMockLessonDetail, createMockMembership } from '@/test/fixtures'

const mockBarn = createMockBarn({
  created_at: '2026-01-01T00:00:00Z',
})

const mockLessonDetail = createMockLessonDetail({
  instructor_id: 'mem-1',
  fee: 75,
  lesson_at: '2026-05-17T10:00:00Z',
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

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'unknown', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_is_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_membership_is_not_active', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, status: 'pending' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'nonexistent' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_call_notFound_when_rider_is_not_enrolled_in_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } }],
    })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
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

  it('should_render_the_lesson_time_in_the_viewers_local_timezone_not_utc', async () => {
    const originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      // 2026-05-17T10:00:00Z is 6:00 AM EDT (UTC-4) — a naive UTC-timeZone
      // formatter would show 10:00 AM instead.
      const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
      render(jsx)
      expect(screen.getByText(/6:00 am/i)).toBeDefined()
    } finally {
      process.env.TZ = originalTz
    }
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

  it('should_not_render_exertion_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      // exertion_level present here to prove the UI guard itself hides it, independent of
      // the DAL-layer fix that omits the column for a real rider-role query.
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText(/exertion/i)).toBeNull()
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
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: '2026-05-17T10:00:00Z', payment_type: 'cash' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByTestId('delete-lesson-button')).toBeNull()
  })

  it('should_link_to_the_delete_confirmation_page_for_manager_on_a_paid_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: '2026-05-17T10:00:00Z', payment_type: 'cash' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /delete/i }).getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1/delete')
  })

  it('should_show_bare_delete_button_for_manager_on_an_unpaid_past_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: '2026-05-17T10:00:00Z', payment_type: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByTestId('delete-lesson-button')).toBeDefined()
  })

  it('should_link_to_the_delete_confirmation_page_for_manager_on_a_zero_fee_lesson', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: '2026-05-17T10:00:00Z', fee: 0, payment_type: null })
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

  it('should_not_show_horse_notes_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('watch left lead')).toBeNull()
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

  it('should_show_inactive_badge_next_to_inactive_horse', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Willow', is_active: false, is_available: true } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Inactive')).toBeDefined()
  })

  it('should_show_unavailable_badge_next_to_unavailable_horse', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Buttercup', is_active: true, is_available: false } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Unavailable')).toBeDefined()
  })

  it('should_show_inactive_badge_not_unavailable_when_horse_is_both', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Willow', is_active: false, is_available: false } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Unavailable')).toBeNull()
  })

  it('should_not_show_status_badge_for_active_available_horse', async () => {
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Inactive')).toBeNull()
    expect(screen.queryByText('Unavailable')).toBeNull()
  })

  it('should_show_horse_status_banner_when_future_uncancelled_lesson_has_inactive_horse', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_at: '2099-01-01T10:00:00Z',
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Buttercup', is_active: false, is_available: true, unavailability_reason: null } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Buttercup is inactive')).toBeDefined()
  })

  it('should_show_horse_status_banner_with_unavailability_reason', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_at: '2099-01-01T10:00:00Z',
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Rocky', is_active: true, is_available: false, unavailability_reason: 'lame — resting per vet' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Rocky is unavailable: lame — resting per vet')).toBeDefined()
  })

  it('should_hide_horse_status_banner_when_lesson_is_in_the_past', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_at: '2020-01-01T10:00:00Z',
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Buttercup', is_active: false, is_available: true, unavailability_reason: null } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Buttercup is inactive')).toBeNull()
  })

  it('should_hide_horse_status_banner_when_lesson_is_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_at: '2099-01-01T10:00:00Z',
      cancelled_at: '2026-01-01T00:00:00Z',
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Buttercup', is_active: false, is_available: true, unavailability_reason: null } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Buttercup is inactive')).toBeNull()
  })

  it('should_hide_horse_status_banner_when_all_horses_active_and_available', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_at: '2099-01-01T10:00:00Z',
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Needs Attention')).toBeNull()
  })

  it('should_hide_horse_notes_label_when_horse_notes_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Horse Notes')).toBeNull()
  })

  it('should_hide_your_notes_label_when_rider_notes_is_null_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Your Notes')).toBeNull()
  })

  it('should_keep_cancel_link_when_rider_notes_is_null_for_rider_role', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } }],
    })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /^cancel$/i })).toBeDefined()
  })

  it('should_show_unpaid_badge_when_past_lesson_with_fee_and_no_payment', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: '2026-05-17T10:00:00Z', fee: 75, payment_type: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.getByText('Unpaid')).toBeDefined()
  })

  it('should_not_show_unpaid_badge_when_fee_is_zero', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: '2026-05-17T10:00:00Z', fee: 0, payment_type: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Unpaid')).toBeNull()
  })

  it('should_not_show_unpaid_badge_when_payment_type_is_set', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: '2026-05-17T10:00:00Z', fee: 75, payment_type: 'cash' as const })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Unpaid')).toBeNull()
  })

  it('should_not_show_unpaid_badge_when_lesson_is_in_future', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLessonDetail, lesson_at: '2099-01-01T10:00:00Z', fee: 75, payment_type: null })
    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)
    expect(screen.queryByText('Unpaid')).toBeNull()
  })

  it('should_hide_header_cancel_link_when_lesson_ineligible', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, role: 'manager' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_at: '2026-05-17T10:00:00Z',
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
      lesson_at: '2026-05-17T10:00:00Z',
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
