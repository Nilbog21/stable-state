import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockExpenseWithHorses, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({ getExpensesByBarn: vi.fn() }))
vi.mock('../OlderExpensesToggle', () => ({ OlderExpensesToggle: () => null }))

import { requireMembership } from '@/lib/auth/guard'
import { getExpensesByBarn } from '@/lib/db/expenses'
import ExpensesPage from '../page'
import { calendarDate } from '@/lib/local-day'
import type { CalendarDate } from '@/lib/db/types'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

function dateOffsetDays(days: number): CalendarDate {
  return calendarDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
}

describe('ExpensesPage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getExpensesByBarn).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: managerMembership,
    })
    vi.mocked(getExpensesByBarn).mockResolvedValue([])
  })

  afterEach(cleanup)

  it('should_call_requireMembership_with_manager_role', async () => {
    await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_render_heading_for_manager', async () => {
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Expenses' })).toBeDefined()
  })

  it('should_render_add_expense_button_href', async () => {
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const links = screen.getAllByRole('link', { name: 'Add Expense' })
    expect((links[0] as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/expenses\/new$/)
  })

  it('should_show_empty_state_when_no_expenses', async () => {
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no expenses/i)).toBeDefined()
  })

  it('should_show_recent_expense_by_default', async () => {
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: dateOffsetDays(3), recipient: 'Recent Vet' }),
    ])
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/Recent Vet/)).toBeDefined()
  })

  it('should_not_show_older_expense_by_default', async () => {
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: dateOffsetDays(10), recipient: 'Old Vet' }),
    ])
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Old Vet')).toBeNull()
  })

  it('should_not_render_any_expense_cards_when_all_expenses_are_older_than_cutoff', async () => {
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: dateOffsetDays(10) }),
    ])
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  /**
   * The page is where the barn's wall clock is minted, so it is where the frame can be got wrong
   * — and the badge is the only observable that reads it. 2026-07-02T01:00Z is 9 PM on the 1st in
   * the barn's own `America/New_York`, and 6:30 AM on the 2nd in the runner's pinned Asia/Kolkata
   * (#1221): a page that passed the host's clock, or `Date.now()`, badges this card. Nothing else
   * in this file distinguishes the two frames.
   */
  it('should_not_badge_a_date_only_expense_before_the_barns_own_midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-02T01:00:00Z'))
    try {
      vi.mocked(getExpensesByBarn).mockResolvedValue([
        createMockExpenseWithHorses({ expense_date: calendarDate('2026-07-01'), amount: null, expense_time: null }),
      ])
      const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
      render(jsx)
      expect(screen.queryByText('Past Due')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
