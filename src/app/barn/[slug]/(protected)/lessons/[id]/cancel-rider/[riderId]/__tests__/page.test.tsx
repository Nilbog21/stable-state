import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/lessons', () => ({ getLessonById: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ cancelRiderParticipationAction: vi.fn() }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { notFound } from 'next/navigation'
import CancelRiderParticipationPage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }

const mockManagerMembership = {
  id: 'mem-manager-1', user_id: 'user-1', barn_id: 'barn-1',
  role: 'manager' as const, status: 'active' as const, created_at: '',
}

const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

const mockLesson = {
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
  instructor_name: 'Jane Smith',
  lesson_horses: [],
  lesson_riders: [
    {
      rider_notes: null,
      private_notes: null,
      cancelled_at: null,
      barn_membership: { id: 'rider-mem-1', user_id: 'rider-user-1', name: 'Alice Rider' },
    },
  ],
}

function setupDefaults() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1' } as any)
  vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
  vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
  vi.mocked(getLessonById).mockResolvedValue(mockLesson)
}

const params = Promise.resolve({ slug: 'green-acres', id: 'lesson-1', riderId: 'rider-mem-1' })

describe('CancelRiderParticipationPage', () => {
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
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_user_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_missing', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, status: 'pending' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_whole_lesson_already_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, cancelled_at: '2026-01-01T00:00:00Z' })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_trainer_is_not_the_instructor', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: 'other-trainer' })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_rider_id_not_in_lesson', async () => {
    const badParams = Promise.resolve({ slug: 'green-acres', id: 'lesson-1', riderId: 'nonexistent-rider' })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params: badParams })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_rider_tries_to_open_another_riders_cancel_page', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'rider' as const, user_id: 'some-other-user' })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_participation_already_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLesson,
      lesson_riders: [{ ...mockLesson.lesson_riders[0], cancelled_at: '2026-01-01T00:00:00Z' }],
    })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_lesson_is_past_and_paid', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, lesson_at: pastIso, payment_type: 'cash' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(CancelRiderParticipationPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_form_for_manager_regardless_of_instructor', async () => {
    vi.mocked(getLessonById).mockResolvedValue({ ...mockLesson, instructor_id: 'other-trainer' })
    const jsx = await CancelRiderParticipationPage({ params })
    render(jsx)
    expect(screen.getByRole('button', { name: /confirm cancellation/i })).toBeDefined()
  })

  it('should_render_type_selector_for_manager', async () => {
    const jsx = await CancelRiderParticipationPage({ params })
    render(jsx)
    expect(screen.getByLabelText(/cancelled by rider/i)).toBeDefined()
    expect(screen.getByLabelText(/cancelled by instructor/i)).toBeDefined()
  })

  it('should_render_type_selector_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    const jsx = await CancelRiderParticipationPage({ params })
    render(jsx)
    expect(screen.getByLabelText(/cancelled by rider/i)).toBeDefined()
    expect(screen.getByLabelText(/cancelled by instructor/i)).toBeDefined()
  })

  it('should_default_type_selector_to_cancelled_by_rider', async () => {
    const jsx = await CancelRiderParticipationPage({ params })
    render(jsx)
    expect((screen.getByLabelText(/cancelled by rider/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_render_static_cancelled_by_rider_text_for_rider_without_selector', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'rider' as const, user_id: 'rider-user-1' })
    const jsx = await CancelRiderParticipationPage({ params })
    render(jsx)
    expect(screen.getByText(/cancelled by rider/i)).toBeDefined()
    expect(screen.queryByLabelText(/cancelled by instructor/i)).toBeNull()
  })

  it('should_render_notes_textarea', async () => {
    const jsx = await CancelRiderParticipationPage({ params })
    render(jsx)
    expect(screen.getByLabelText(/cancellation notes/i)).toBeDefined()
  })

  it('should_render_confirm_cancellation_button', async () => {
    const jsx = await CancelRiderParticipationPage({ params })
    render(jsx)
    expect(screen.getByRole('button', { name: /confirm cancellation/i })).toBeDefined()
  })
})
