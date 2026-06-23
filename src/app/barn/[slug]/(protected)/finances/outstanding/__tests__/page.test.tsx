import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/lesson-finances', () => ({ getOutstandingLessons: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { requireMembership } from '@/lib/auth/guard'
import { getOutstandingLessons } from '@/lib/db/lesson-finances'
import OutstandingPage from '../page'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const managerMembership = createMockMembership({ role: 'manager' })
const trainerMembership = createMockMembership({ role: 'trainer' })
const riderMembership = createMockMembership({ role: 'rider' })

describe('OutstandingPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getOutstandingLessons).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getOutstandingLessons).mockResolvedValue([])
  })

  it('should_render_heading', async () => {
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Outstanding Payments' })).toBeDefined()
  })

  it('should_call_requireMembership_with_all_roles', async () => {
    await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
  })

  it('should_redirect_when_requireMembership_throws', async () => {
    vi.mocked(requireMembership).mockRejectedValue(
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/barn/green-acres/login' })
    )
    await expect(OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_call_getOutstandingLessons_with_user_id_and_role', async () => {
    await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(getOutstandingLessons).toHaveBeenCalledWith(mockBarn.id, mockUser.id, 'manager')
  })

  it('should_render_empty_state_when_no_outstanding_lessons', async () => {
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No outstanding lessons.')).toBeDefined()
  })

  it('should_render_instructor_name_in_outstanding_table', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{
      id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-05-15T10:00:00Z',
      instructor_name: 'Jane Smith', rider_names: [], fee: 75,
    }])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Jane Smith')).toBeDefined()
  })

  it('should_link_each_row_to_lesson_detail', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{
      id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-05-15T10:00:00Z',
      instructor_name: null, rider_names: [], fee: 75,
    }])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 15, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1')
  })

  it('should_show_back_link_to_finances_for_manager', async () => {
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const backLink = screen.getByRole('link', { name: /back/i })
    expect(backLink.getAttribute('href')).toBe('/barn/green-acres/finances')
  })

  it('should_show_back_link_to_barn_home_for_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: trainerMembership })
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const backLink = screen.getByRole('link', { name: /back/i })
    expect(backLink.getAttribute('href')).toBe('/barn/green-acres')
  })

  it('should_show_back_link_to_barn_home_for_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: riderMembership })
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const backLink = screen.getByRole('link', { name: /back/i })
    expect(backLink.getAttribute('href')).toBe('/barn/green-acres')
  })

  it('should_call_getOutstandingLessons_with_trainer_role', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: trainerMembership })
    await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(getOutstandingLessons).toHaveBeenCalledWith(mockBarn.id, mockUser.id, 'trainer')
  })

  it('should_call_getOutstandingLessons_with_rider_role', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: riderMembership })
    await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(getOutstandingLessons).toHaveBeenCalledWith(mockBarn.id, mockUser.id, 'rider')
  })

  it('should_render_dash_when_fee_is_null', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{
      id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-05-15T10:00:00Z',
      instructor_name: null, rider_names: [], fee: null,
    }])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
