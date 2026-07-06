import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/lesson-finances', () => ({ getHorseIncomeDetail: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { requireMembership } from '@/lib/auth/guard'
import { getHorseIncomeDetail } from '@/lib/db/lesson-finances'
import HorseIncomePage from '../page'

const mockBarn = createMockBarn({ created_at: '2026-01-01T00:00:00Z' })
const mockUser = createMockUser()
const managerMembership = createMockMembership({ role: 'manager' })

const defaultParams = Promise.resolve({ slug: 'green-acres', id: 'horse-1' })
const maySearchParams = Promise.resolve({ month: '2026-05' })

describe('HorseIncomePage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getHorseIncomeDetail).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({ horseName: 'Thunderbolt', rows: [], chargeRows: [], total: 0 })
  })

  it('should_call_requireMembership_with_manager_only', async () => {
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_redirect_when_requireMembership_throws', async () => {
    vi.mocked(requireMembership).mockRejectedValue(
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/barn/green-acres/login' })
    )
    await expect(HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_not_allow_trainer_role', async () => {
    vi.mocked(requireMembership).mockRejectedValue(
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/barn/green-acres/login' })
    )
    await expect(HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_call_getHorseIncomeDetail_with_horse_id', async () => {
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(getHorseIncomeDetail).toHaveBeenCalledWith(mockBarn.id, 'horse-1', expect.any(Date), expect.any(Date), mockBarn.instructor_cut)
  })

  it('should_render_horse_name_as_heading', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({ horseName: 'Thunderbolt', rows: [], chargeRows: [], total: 0 })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Thunderbolt' })).toBeDefined()
  })

  it('should_render_empty_state_when_no_rows', async () => {
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/no lessons/i)).toBeDefined()
  })

  it('should_render_lesson_date_in_table', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/May 10, 2026/i)).toBeDefined()
  })

  it('should_render_full_fee_in_table', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0)
  })

  it('should_render_horse_count_in_table', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 2, splitAmount: 50 }],
      chargeRows: [], total: 50,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('2')).toBeDefined()
  })

  it('should_render_split_amount_in_table', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 2, splitAmount: 50 }],
      chargeRows: [], total: 50,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$50.00').length).toBeGreaterThan(0)
  })

  it('should_render_total_row', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/total/i)).toBeDefined()
  })

  it('should_render_back_link_pointing_to_finances', async () => {
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toContain('/barn/green-acres/finances')
  })

  it('should_render_back_link_with_horse_tab_param', async () => {
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toContain('tab=horse')
  })

  it('should_link_date_to_lesson_detail', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 10, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/lessons/lesson-1')
  })

  it('should_render_a_charge_rows_kind', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 }],
      total: 500,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('Boarding')).toBeDefined()
  })

  it('should_render_a_charge_rows_fee', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 }],
      total: 500,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$500.00').length).toBeGreaterThan(0)
  })

  it('should_link_charge_row_to_agreement_detail', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'lease', fee: 200 }],
      total: 200,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 1, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/agreements/agreement-1')
  })

  it('should_combine_lesson_and_charge_rows_in_total', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', fee: 500 }],
      total: 600,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$600.00').length).toBeGreaterThan(0)
  })
})
