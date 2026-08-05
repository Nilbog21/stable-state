import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { withBlocker } from '@/test/navigation-blocker-harness'

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
import CancelLessonPage from '../page'
import { createMockBarn, createMockLessonDetail, createMockMembership, instant } from '@/test/fixtures'

const futureIso = instant(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())

describe('CancelLessonPage — navigation dirty state', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1' } as never)
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ id: 'barn-1', slug: 'green-acres' }))
    vi.mocked(getUserMembership).mockResolvedValue(
      createMockMembership({ id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1', role: 'manager', status: 'active' })
    )
    vi.mocked(getLessonById).mockResolvedValue(
      createMockLessonDetail({
        id: 'lesson-1',
        barn_id: 'barn-1',
        lesson_at: futureIso,
        lesson_type: 'normal',
        cancelled_at: null,
        lesson_riders: [],
      })
    )
  })

  it('should_set_dirty_when_cancellation_notes_typed', async () => {
    const jsx = await CancelLessonPage({ params: Promise.resolve({ slug: 'green-acres', id: 'lesson-1' }) })
    render(withBlocker(jsx))
    fireEvent.change(screen.getByLabelText(/cancellation notes/i), { target: { value: 'sick horse' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
