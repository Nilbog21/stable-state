import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/lesson-finances', () => ({ getHorseIncomeDetail: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({ getHorseExpenseDetail: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { requireMembership } from '@/lib/auth/guard'
import { getHorseIncomeDetail } from '@/lib/db/lesson-finances'
import { getHorseExpenseDetail } from '@/lib/db/expenses'
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
    vi.mocked(getHorseExpenseDetail).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({ horseName: 'Thunderbolt', rows: [], chargeRows: [], total: 0 })
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({ horseName: 'Thunderbolt', rows: [], total: 0 })
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

  it('should_call_getHorseExpenseDetail_with_horse_id', async () => {
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(getHorseExpenseDetail).toHaveBeenCalledWith(mockBarn.id, 'horse-1', expect.any(Date), expect.any(Date))
  })

  it('should_render_horse_name_as_heading', async () => {
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Thunderbolt' })).toBeDefined()
  })

  it('should_render_empty_state_when_no_rows', async () => {
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/no activity/i)).toBeDefined()
  })

  it('should_not_render_empty_state_when_only_expenses_exist', async () => {
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-12', amount: 75, horseCount: 1, splitAmount: 75 }],
      total: 75,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.queryByText(/no activity/i)).toBeNull()
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

  it('should_render_lesson_type_label', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('Lesson')).toBeDefined()
  })

  it('should_render_net_row', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/^net$/i)).toBeDefined()
  })

  it('should_subtract_expense_total_from_net', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-10T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-01', amount: 30, horseCount: 1, splitAmount: 30 }],
      total: 30,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$70.00').length).toBeGreaterThan(0)
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

  it('should_render_dash_for_horses_column_on_charge_row', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [],
      chargeRows: [{ chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'lease', fee: 200 }],
      total: 200,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_combine_lesson_and_charge_rows_in_net', async () => {
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

  it('should_render_expense_row_date_in_table', async () => {
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-12', amount: 75, horseCount: 1, splitAmount: 75 }],
      total: 75,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/May 12, 2026/i)).toBeDefined()
  })

  it('should_render_expense_row_amount_in_parens', async () => {
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-12', amount: 75, horseCount: 1, splitAmount: 75 }],
      total: 75,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('($75.00)').length).toBeGreaterThan(0)
  })

  it('should_render_expense_row_split_in_parens', async () => {
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-12', amount: 90, horseCount: 3, splitAmount: 30 }],
      total: 30,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('($30.00)').length).toBeGreaterThan(0)
  })

  it('should_render_expense_row_horse_count', async () => {
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-12', amount: 90, horseCount: 3, splitAmount: 30 }],
      total: 30,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('3')).toBeDefined()
  })

  it('should_render_expense_type_label', async () => {
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-12', amount: 75, horseCount: 1, splitAmount: 75 }],
      total: 75,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('Expense')).toBeDefined()
  })

  it('should_link_expense_date_to_expense_detail', async () => {
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-12', amount: 75, horseCount: 1, splitAmount: 75 }],
      total: 75,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 12, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/expenses/expense-1')
  })

  it('should_render_rows_in_date_ascending_order', async () => {
    vi.mocked(getHorseIncomeDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ lessonId: 'lesson-1', lessonAt: '2026-05-20T10:00:00Z', fee: 100, horseCount: 1, splitAmount: 100 }],
      chargeRows: [], total: 100,
    })
    vi.mocked(getHorseExpenseDetail).mockResolvedValue({
      horseName: 'Thunderbolt',
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-05', amount: 40, horseCount: 1, splitAmount: 40 }],
      total: 40,
    })
    const jsx = await HorseIncomePage({ params: defaultParams, searchParams: maySearchParams })
    const { container } = render(jsx)
    const text = container.textContent ?? ''
    expect(text.indexOf('May 5, 2026')).toBeLessThan(text.indexOf('May 20, 2026'))
  })
})
