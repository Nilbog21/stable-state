import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/outstanding', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/outstanding')>('@/lib/db/outstanding')
  return { ...actual, getOutstandingLessons: vi.fn(), getOutstandingCancellationFees: vi.fn() }
})
vi.mock('@/lib/db/agreement-finances', () => ({ getOutstandingCharges: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { requireMembership } from '@/lib/auth/guard'
import { getOutstandingLessons, getOutstandingCancellationFees } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
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
    vi.mocked(getOutstandingCharges).mockReset()
    vi.mocked(getOutstandingCancellationFees).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getOutstandingLessons).mockResolvedValue([])
    vi.mocked(getOutstandingCharges).mockResolvedValue([])
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([])
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

  it('should_call_getOutstandingCharges_with_user_id_and_role', async () => {
    await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(getOutstandingCharges).toHaveBeenCalledWith(mockBarn.id, mockUser.id, 'manager')
  })

  it('should_render_empty_state_when_no_outstanding_items', async () => {
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No outstanding items.')).toBeDefined()
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

  it('should_render_a_charge_row_with_its_type_and_rider_name', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Carol Rider')).toBeDefined()
    expect(screen.getByText('Boarding')).toBeDefined()
  })

  it('should_link_a_charge_row_to_its_agreement', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 1, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/agreements/agreement-1')
  })

  it('should_not_link_a_charge_row_for_a_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: /May 1, 2026/i })).toBeNull()
    expect(screen.getByText('May 1, 2026')).toBeDefined()
  })

  it('should_sort_the_earlier_charge_row_before_a_later_lesson_row', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{
      id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-05-20T10:00:00Z',
      instructor_name: null, rider_names: [], fee: 75,
    }])
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'lease', riderName: 'Dana Rider', fee: 200 },
    ])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].textContent).toContain('Dana Rider')
  })

  it('should_sort_the_later_lesson_row_after_an_earlier_charge_row', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{
      id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-05-20T10:00:00Z',
      instructor_name: null, rider_names: [], fee: 75,
    }])
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'lease', riderName: 'Dana Rider', fee: 200 },
    ])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[1].textContent).toContain('75')
  })

  it('should_call_getOutstandingCancellationFees_with_user_id_and_role', async () => {
    await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(getOutstandingCancellationFees).toHaveBeenCalledWith(mockBarn.id, mockUser.id, 'manager')
  })

  it('should_render_a_cancellation_fee_row_with_its_type_label', async () => {
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([
      { id: 'lesson-rider-1', lessonId: 'lesson-2', lessonAt: '2026-05-10T10:00:00Z', instructorName: 'Jane Doe', riderName: 'Erin Rider', fee: 50 },
    ])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Cancellation Fee')).toBeDefined()
    expect(screen.getByText('Erin Rider')).toBeDefined()
  })

  it('should_link_a_cancellation_fee_row_to_its_parent_lesson', async () => {
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([
      { id: 'lesson-rider-1', lessonId: 'lesson-2', lessonAt: '2026-05-10T10:00:00Z', instructorName: null, riderName: 'Erin Rider', fee: 50 },
    ])
    const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 10, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-2')
  })

  describe('timezone-aware date display', () => {
    // 2026-05-16T02:00:00Z is 10:00 PM EDT on May 15 — a naive UTC-anchored formatter
    // would show May 16 instead.
    it('should_display_a_lesson_rows_date_in_the_barns_timezone_not_utc', async () => {
      vi.mocked(getOutstandingLessons).mockResolvedValue([{
        id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-05-16T02:00:00Z',
        instructor_name: null, rider_names: [], fee: 75,
      }])
      const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('May 15, 2026')).toBeDefined()
    })

    it('should_display_a_cancellation_fee_rows_date_in_the_barns_timezone_not_utc', async () => {
      vi.mocked(getOutstandingCancellationFees).mockResolvedValue([
        { id: 'lesson-rider-1', lessonId: 'lesson-2', lessonAt: '2026-05-16T02:00:00Z', instructorName: null, riderName: 'Erin Rider', fee: 50 },
      ])
      const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('May 15, 2026')).toBeDefined()
    })

    it('should_keep_a_charge_rows_date_utc_anchored_regardless_of_timezone', async () => {
      vi.mocked(getOutstandingCharges).mockResolvedValue([
        { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
      ])
      const jsx = await OutstandingPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.getByText('May 1, 2026')).toBeDefined()
    })
  })
})
