import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/lessons', () => ({ getLessonById: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ deleteLessonAction: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getLessonById } from '@/lib/db/lessons'
import { notFound } from 'next/navigation'
import DeleteLessonPage from '../page'
import { createMockBarn, createMockLessonDetail, createMockMembership } from '@/test/fixtures'

const mockBarn = createMockBarn({ id: 'barn-1', name: 'Green Acres', slug: 'green-acres', default_instructor_cut: 25, created_at: '' })

const mockManagerMembership = createMockMembership({
  id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1',
  role: 'manager' as const, status: 'active' as const, created_at: '',
})

const mockPaidLesson = createMockLessonDetail({ fee: 75, payment_type: 'cash' as const })

function setupDefaults() {
  vi.mocked(requireMembership).mockResolvedValue({
    user: { id: 'user-1' } as any,
    barn: mockBarn,
    membership: mockManagerMembership,
  })
  vi.mocked(getLessonById).mockResolvedValue(mockPaidLesson)
}

const params = Promise.resolve({ slug: 'green-acres', id: 'lesson-1' })

describe('DeleteLessonPage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockReset()
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getLessonById).mockReset()
    setupDefaults()
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await DeleteLessonPage({ params })
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_notFound_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(DeleteLessonPage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_the_collected_fee_amount', async () => {
    const jsx = await DeleteLessonPage({ params })
    render(jsx)
    expect(screen.getAllByText(/75/).length).toBeGreaterThan(0)
  })

  it('should_render_an_unchecked_delete_transactions_checkbox_by_default', async () => {
    const jsx = await DeleteLessonPage({ params })
    render(jsx)
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('should_render_confirm_delete_button', async () => {
    const jsx = await DeleteLessonPage({ params })
    render(jsx)
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeDefined()
  })
})
