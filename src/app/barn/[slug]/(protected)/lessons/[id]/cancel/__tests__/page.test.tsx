import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/lessons', () => ({ getLessonById: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/lesson-cancellation', () => ({ cancelLessonAction: vi.fn() }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { notFound } from 'next/navigation'
import CancelLessonPage from '../page'
import { createMockBarn, createMockLessonDetail, createMockMembership, instant } from '@/test/fixtures'

const mockBarn = createMockBarn({ id: 'barn-1', name: 'Green Acres', slug: 'green-acres', default_instructor_cut: 25, created_at: '' })

const mockManagerMembership = createMockMembership({
  id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1',
  role: 'manager' as const, status: 'active' as const, created_at: '',
})

const futureIso = instant(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
const pastIso = instant(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

const mockLesson = createMockLessonDetail({
  id: 'lesson-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: futureIso,
  submitted_at: '2026-05-17T10:05:00Z',
  lesson_type: 'normal' as const,
  jumping: false,
  payment_type: null,
  tier_name: 'Custom',
  cancelled_at: null,
  cancellation_notes: null,
  series_id: null,
  instructor_name: 'Jane Smith',
  lesson_horses: [],
  lesson_riders: [],
})

function setupDefaults() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1' } as any)
  vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
  vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
  vi.mocked(getLessonById).mockResolvedValue(mockLesson)
}

const params = Promise.resolve({ slug: 'green-acres', id: 'lesson-1' })

describe('CancelLessonPage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getLessonById).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getAuthenticatedUser).mockReset()
    setupDefaults()
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_user_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_missing', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_inactive', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, status: 'inactive' } as any)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_role_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'rider' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_trainer_is_not_the_instructor', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: 'other-trainer' })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_lesson_already_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, cancelled_at: '2026-01-01T00:00:00Z' })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_lesson_is_past_and_paid', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, lesson_at: pastIso, payment_type: 'cash' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_form_when_future_lesson_regardless_of_payment', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, lesson_at: futureIso, payment_type: 'cash' as const })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByRole('button', { name: /confirm cancellation/i })).toBeDefined()
  })

  it('should_render_form_when_past_and_unpaid', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, lesson_at: pastIso, payment_type: null })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByRole('button', { name: /confirm cancellation/i })).toBeDefined()
  })

  it('should_render_notes_textarea', async () => {
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByLabelText(/cancellation notes/i)).toBeDefined()
  })

  it('should_render_cancelled_by_rider_radio_for_normal_lesson', async () => {
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByLabelText(/cancelled by rider/i)).toBeDefined()
  })

  it('should_render_cancelled_by_instructor_radio_for_normal_lesson', async () => {
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByLabelText(/cancelled by instructor/i)).toBeDefined()
  })

  it('should_default_cancel_type_radio_to_rider_for_normal_lesson', async () => {
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect((screen.getByLabelText(/cancelled by rider/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_check_instructor_radio_when_actor_instructs_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: 'mem-1' })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect((screen.getByLabelText(/cancelled by instructor/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_uncheck_rider_radio_when_actor_instructs_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: 'mem-1' })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect((screen.getByLabelText(/cancelled by rider/i) as HTMLInputElement).checked).toBe(false)
  })

  it('should_render_instructor_radio_before_rider_radio_regardless_of_default', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: 'mem-1' })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    const radios = screen.getAllByRole('radio').map((el) => (el as HTMLInputElement).value)
    expect(radios).toEqual(['instructor', 'rider'])
  })

  it('should_keep_fixed_radio_order_when_rider_is_the_default', async () => {
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    const radios = screen.getAllByRole('radio').map((el) => (el as HTMLInputElement).value)
    expect(radios).toEqual(['instructor', 'rider'])
  })

  it('should_render_rider_radio_for_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByLabelText(/cancelled by rider/i)).toBeDefined()
  })

  it('should_render_instructor_radio_for_group_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByLabelText(/cancelled by instructor/i)).toBeDefined()
  })

  it('should_show_affected_rider_count_for_group_lesson_by_default_when_instructor_cancels', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      instructor_id: 'mem-1',
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByText(/2 enrolled riders/i)).toBeDefined()
  })

  it('should_show_affected_rider_names_for_group_lesson_by_default_when_instructor_cancels', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      instructor_id: 'mem-1',
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByText(/Alice, Bob/)).toBeDefined()
  })

  it('should_exclude_already_cancelled_riders_from_group_lesson_affected_count', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      instructor_id: 'mem-1',
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: '2026-01-01T00:00:00Z', barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByText(/1 enrolled rider/i)).toBeDefined()
  })

  it('should_count_active_rider_with_null_barn_membership_in_group_lesson_affected_count', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      instructor_id: 'mem-1',
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: null },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByText(/2 enrolled riders/i)).toBeDefined()
  })

  it('should_hide_rider_picker_for_group_lesson_by_default_when_instructor_cancels', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      instructor_id: 'mem-1',
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.queryByRole('radio', { name: 'Alice' })).toBeNull()
  })

  it('should_show_alice_in_rider_picker_for_group_lesson_by_default_when_rider_cancels', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByRole('radio', { name: 'Alice' })).toBeDefined()
  })

  it('should_show_bob_in_rider_picker_for_group_lesson_by_default_when_rider_cancels', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByRole('radio', { name: 'Bob' })).toBeDefined()
  })

  it('should_include_active_rider_in_group_lesson_picker', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: '2026-01-01T00:00:00Z', barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByRole('radio', { name: 'Alice' })).toBeDefined()
  })

  it('should_exclude_already_cancelled_riders_from_group_lesson_picker', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: '2026-01-01T00:00:00Z', barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.queryByRole('radio', { name: 'Bob' })).toBeNull()
  })

  it('should_not_show_rider_picker_for_normal_lesson_when_rider_selected', async () => {
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    fireEvent.click(screen.getByLabelText(/cancelled by rider/i))
    expect(screen.queryByRole('radio', { name: 'Alice' })).toBeNull()
  })

  it('should_show_late_fee_warning_for_normal_lesson_within_24h', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, lesson_at: futureIso })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.getByText(/due a late cancellation fee/i)).toBeDefined()
  })

  it('should_hide_late_fee_warning_for_normal_lesson_beyond_24h', async () => {
    const farFutureIso = instant(new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString())
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, lesson_at: farFutureIso })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    expect(screen.queryByText(/due a late cancellation fee/i)).toBeNull()
  })

  it('should_show_group_late_fee_gap_warning_within_24h_when_rider_selected', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      lesson_at: futureIso,
      lesson_type: 'group' as const,
      lesson_riders: [
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: 'user-1' } },
        { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } },
      ],
    })
    const jsx = await CancelLessonPage({ params })
    render(jsx)
    fireEvent.click(screen.getByLabelText(/cancelled by rider/i))
    expect(screen.getByText(/no late cancellation fees are currently leveraged/i)).toBeDefined()
  })
})
