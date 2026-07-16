import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/expense-finances', () => ({ getRecipientExpenseDetail: vi.fn() }))

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { requireMembership } from '@/lib/auth/guard'
import { getRecipientExpenseDetail } from '@/lib/db/expense-finances'
import RecipientExpensePage from '../page'

const mockBarn = createMockBarn({ created_at: '2026-01-01T00:00:00Z' })
const mockUser = createMockUser()
const managerMembership = createMockMembership({ role: 'manager' })

const defaultParams = Promise.resolve({ slug: 'green-acres', recipient: 'Dr. Smith' })
const maySearchParams = Promise.resolve({ month: '2026-05' })

describe('RecipientExpensePage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getRecipientExpenseDetail).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({ user: mockUser as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getRecipientExpenseDetail).mockResolvedValue({ rows: [], total: 0 })
  })

  it('should_call_requireMembership_with_manager_only', async () => {
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_redirect_when_requireMembership_throws', async () => {
    vi.mocked(requireMembership).mockRejectedValue(
      Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/barn/green-acres/login' })
    )
    await expect(RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_call_getRecipientExpenseDetail_with_recipient', async () => {
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(getRecipientExpenseDetail).toHaveBeenCalledWith(mockBarn.id, 'Dr. Smith', expect.any(Date), expect.any(Date), mockBarn.timezone)
  })

  it('should_render_recipient_name_as_heading', async () => {
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Dr. Smith' })).toBeDefined()
  })

  it('should_render_empty_state_when_no_rows', async () => {
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/no activity/i)).toBeDefined()
  })

  it('should_render_expense_date_in_table', async () => {
    vi.mocked(getRecipientExpenseDetail).mockResolvedValue({
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-10', expenseType: 'Veterinary', amount: 100 }],
      total: 100,
    })
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/May 10, 2026/i)).toBeDefined()
  })

  it('should_render_expense_type', async () => {
    vi.mocked(getRecipientExpenseDetail).mockResolvedValue({
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-10', expenseType: 'Veterinary', amount: 100 }],
      total: 100,
    })
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText('Veterinary')).toBeDefined()
  })

  it('should_render_amount_in_table', async () => {
    vi.mocked(getRecipientExpenseDetail).mockResolvedValue({
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-10', expenseType: 'Veterinary', amount: 100 }],
      total: 100,
    })
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0)
  })

  it('should_link_date_to_expense_detail', async () => {
    vi.mocked(getRecipientExpenseDetail).mockResolvedValue({
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-10', expenseType: 'Veterinary', amount: 100 }],
      total: 100,
    })
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    const link = screen.getByRole('link', { name: /May 10, 2026/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/expenses/expense-1')
  })

  it('should_render_total_row', async () => {
    vi.mocked(getRecipientExpenseDetail).mockResolvedValue({
      rows: [{ expenseId: 'expense-1', expenseDate: '2026-05-10', expenseType: 'Veterinary', amount: 100 }],
      total: 100,
    })
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByText(/total/i)).toBeDefined()
  })

  it('should_accumulate_total_across_multiple_expenses', async () => {
    vi.mocked(getRecipientExpenseDetail).mockResolvedValue({
      rows: [
        { expenseId: 'expense-1', expenseDate: '2026-05-10', expenseType: 'Veterinary', amount: 100 },
        { expenseId: 'expense-2', expenseDate: '2026-05-15', expenseType: 'Feed', amount: 60 },
      ],
      total: 160,
    })
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getAllByText('$160.00').length).toBeGreaterThan(0)
  })

  it('should_render_back_link_pointing_to_finances', async () => {
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toContain('/barn/green-acres/finances')
  })

  it('should_render_back_link_with_recipient_tab_param', async () => {
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    render(jsx)
    expect(screen.getByRole('link', { name: /back/i }).getAttribute('href')).toContain('tab=recipient')
  })

  it('should_decode_url_encoded_recipient_param', async () => {
    const encodedParams = Promise.resolve({ slug: 'green-acres', recipient: encodeURIComponent('Dr. Smith & Sons') })
    const jsx = await RecipientExpensePage({ params: encodedParams, searchParams: maySearchParams })
    render(jsx)
    expect(getRecipientExpenseDetail).toHaveBeenCalledWith(mockBarn.id, 'Dr. Smith & Sons', expect.any(Date), expect.any(Date), mockBarn.timezone)
    expect(screen.getByRole('heading', { name: 'Dr. Smith & Sons' })).toBeDefined()
  })

  it('should_render_rows_in_date_ascending_order', async () => {
    vi.mocked(getRecipientExpenseDetail).mockResolvedValue({
      rows: [
        { expenseId: 'expense-1', expenseDate: '2026-05-20', expenseType: 'Veterinary', amount: 100 },
        { expenseId: 'expense-2', expenseDate: '2026-05-05', expenseType: 'Feed', amount: 40 },
      ],
      total: 140,
    })
    const jsx = await RecipientExpensePage({ params: defaultParams, searchParams: maySearchParams })
    const { container } = render(jsx)
    const text = container.textContent ?? ''
    expect(text.indexOf('May 5, 2026')).toBeLessThan(text.indexOf('May 20, 2026'))
  })
})
