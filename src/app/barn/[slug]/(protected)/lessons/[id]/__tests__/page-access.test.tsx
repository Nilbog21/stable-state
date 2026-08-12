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
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, status: 'inactive' } as any)
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

  it('should_call_notFound_when_rider_is_not_enrolled_in_lesson_and_not_privileged', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      // exertion_level undefined -- this rider holds no lesson_read_privileges for any
      // horse in the lesson, so #999's privileged-viewer bypass doesn't apply either.
      lesson_horses: [{ exertion_level: undefined, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
      lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } }],
    })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })

    await expect(
      LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('should_not_call_notFound_when_rider_is_not_enrolled_but_privileged_for_a_lesson_horse', async () => {
    // #999: a rider-owner with lesson_read_privileges can view a lesson their horse is
    // in even without being an enrolled rider themselves. get_lesson_horse_exertion_levels
    // only returns a row for a horse this rider is privileged for, so a defined
    // exertion_level here is the same signal getLessonById already uses.
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 2, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }],
      lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } }],
    })

    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)

    expect(notFound).not.toHaveBeenCalled()
    expect(screen.getByText(/thunderbolt/i)).toBeDefined()
  })

  it('should_still_mask_other_riders_private_notes_for_a_privileged_non_enrolled_rider', async () => {
    // Privilege only surfaces horse-level data (#999) -- it must not leak a co-rider's
    // rider_notes/private_notes to a non-enrolled privileged viewer.
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockMembership, id: 'rider-1', role: 'rider' as const })
    vi.mocked(getLessonById).mockResolvedValue({
      ...mockLessonDetail,
      lesson_horses: [{ exertion_level: 2, horse_notes: 'watch left lead', horses: { id: 'horse-1', name: 'Thunderbolt' } }],
      lesson_riders: [{ rider_notes: 'needs work', private_notes: 'anxious in the ring', cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: 'user-2' } }],
    })

    const jsx = await LessonDetailPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(jsx)

    expect(screen.queryByText('needs work')).toBeNull()
    expect(screen.queryByText('anxious in the ring')).toBeNull()
  })
})
