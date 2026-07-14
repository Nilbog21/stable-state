import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/lesson-finances', () => ({ getRiderIncomeDetail: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { requireMembership } from '@/lib/auth/guard'
import { getRiderIncomeDetail } from '@/lib/db/lesson-finances'
import RiderIncomePage from '../page'

const mockBarn = createMockBarn({ created_at: '2026-01-01T00:00:00Z' })
const mockUser = createMockUser()
const managerMembership = createMockMembership({ role: 'manager' })

const defaultParams = Promise.resolve({ slug: 'green-acres', id: 'rider-1' })
const maySearchParams = Promise.resolve({ month: '2026-05' })

describe('RiderIncomePage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getRiderIncomeDetail).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({ riderName: 'Alice', rows: [], chargeRows: [], total: 0 })
  })

  it('should_call_requireMembership_with_manager_only', async () => {
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_redirect_when_requireMembership_throws', async () => {
    vi.mocked(requireMembership).mockRejectedValue(
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/barn/green-acres/login' })
    )
    await expect(RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_not_allow_trainer_role', async () => {
    vi.mocked(requireMembership).mockRejectedValue(
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/barn/green-acres/login' })
    )
    await expect(RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_call_getRiderIncomeDetail_with_rider_id', async () => {
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(getRiderIncomeDetail).toHaveBeenCalledWith(mockBarn.id, 'rider-1', expect.any(Date), expect.any(Date))
  })

  it('should_render_rider_name_as_heading', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({ riderName: 'Alice', rows: [], chargeRows: [], total: 0 })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Alice' })).toBeDefined()
  })

  it('should_render_empty_state_when_no_rows', async () => {
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/no activity/i)).toBeDefined()
  })

  it('should_render_lesson_date_in_table', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, riderCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/May 10, 2026/i)).toBeDefined()
  })

  it('should_render_full_fee_in_table', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, riderCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0)
  })

  it('should_render_rider_count_in_table', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, riderCount: 2, splitAmount: 50 }],
      chargeRows: [], total: 50,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('should_render_split_amount_in_table', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, riderCount: 2, splitAmount: 50 }],
      chargeRows: [], total: 50,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0)
  })

  it('should_render_lesson_type_label', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, riderCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('Lesson')).toBeDefined()
  })

  it('should_render_total_row', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, riderCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/total/i)).toBeDefined()
  })

  it('should_render_back_link_pointing_to_finances', async () => {
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toContain('/barn/green-acres/finances')
  })

  it('should_render_back_link_with_rider_tab_param', async () => {
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toContain('tab=rider')
  })

  it('should_link_date_to_lesson_detail', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, riderCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 10, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1')
  })

  it('should_render_a_charge_rows_kind', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 }],
      total: 500,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('Boarding')).toBeDefined()
  })

  it('should_render_a_charge_rows_fee', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 }],
      total: 500,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0)
  })

  it('should_link_charge_row_to_agreement_detail', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'lease', fee: 200 }],
      total: 200,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 1, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/agreements/agreement-1?kind=lease')
  })

  it('should_render_dash_for_riders_column_on_charge_row', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'lease', fee: 200 }],
      total: 200,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_combine_lesson_and_charge_rows_in_total', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, riderCount: 1, splitAmount: 100 }],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 }],
      total: 600,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$600.00').length).toBeGreaterThan(0)
  })

  it('should_render_rows_in_date_ascending_order', async () => {
    vi.mocked(getRiderIncomeDetail).mockResolvedValue({
      riderName: 'Alice',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-20T10:00:00Z', fee: 100, riderCount: 1, splitAmount: 100 }],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-05', kind: 'board', fee: 40 }],
      total: 140,
    })
    const jsx = await RiderIncomePage({ params: defaultParams, searchParams: maySearchParams })
    const { container } = render(jsx)
    const text = container.textContent ?? ''
    expect(text.indexOf('May 5, 2026')).toBeLessThan(text.indexOf('May 20, 2026'))
  })
})
