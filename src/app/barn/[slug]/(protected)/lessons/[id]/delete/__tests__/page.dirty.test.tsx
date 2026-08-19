import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/lessons', () => ({ getLessonById: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ deleteLessonAction: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getLessonById } from '@/lib/db/lessons'
import DeleteLessonPage from '../page'
import { createMockBarn, createMockLessonDetail, createMockMembership } from '@/test/fixtures'

const params = Promise.resolve({ slug: 'green-acres', id: 'lesson-1' })

describe('DeleteLessonPage — navigation dirty state', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as never,
      barn: createMockBarn({ id: 'barn-1', slug: 'green-acres' }),
      membership: createMockMembership({ id: 'mem-1', barn_id: 'barn-1', role: 'manager' }),
    })
    vi.mocked(getLessonById).mockResolvedValue(createMockLessonDetail({ fee: 75, payment_type: 'cash' }))
  })

  it('should_set_dirty_when_also_delete_transactions_checkbox_toggled', async () => {
    const jsx = await DeleteLessonPage({ params })
    render(withBlocker(jsx))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
