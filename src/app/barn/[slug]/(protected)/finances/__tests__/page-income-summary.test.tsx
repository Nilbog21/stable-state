import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))
vi.mock('@/lib/db/lesson-finances', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/lesson-finances')>('@/lib/db/lesson-finances')
  return {
    ...actual,
    getFinancialSummary: vi.fn(),
    getHorseIncomeSummary: vi.fn(),
    getRiderIncomeSummary: vi.fn(),
    getTrainerIncomeSummary: vi.fn(),
  }
})
vi.mock('@/lib/db/outstanding', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/outstanding')>('@/lib/db/outstanding')
  return {
    ...actual,
    getOutstandingLessons: vi.fn(),
    getOutstandingCancellationFees: vi.fn(),
  }
})
vi.mock('@/lib/db/agreement-finances', () => ({ getOutstandingCharges: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({ getOutstandingExpenses: vi.fn() }))
vi.mock('@/lib/db/expense-finances', () => ({ getExpenseFinancialSummary: vi.fn(), getRecipientExpenseSummary: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ updatePaymentTypeAction: vi.fn() }))
vi.mock('@/app/actions/expenses', () => ({ resolvePastDueExpenseAction: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect, useRouter: vi.fn(() => ({ refresh: vi.fn() })) }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary, NON_LESSON_INCOME_LABEL } from '@/lib/db/lesson-finances'
import { getOutstandingLessons, getOutstandingCancellationFees } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
import { getOutstandingExpenses } from '@/lib/db/expenses'
import { getExpenseFinancialSummary, getRecipientExpenseSummary } from '@/lib/db/expense-finances'
import FinancesPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

describe('FinancesPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 0, breakdown: [] })
    vi.mocked(getOutstandingLessons).mockResolvedValue([])
    vi.mocked(getOutstandingCharges).mockReset()
    vi.mocked(getOutstandingCharges).mockResolvedValue([])
    vi.mocked(getOutstandingCancellationFees).mockReset()
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([])
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([])
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([])
    vi.mocked(getExpenseFinancialSummary).mockReset()
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({ totalExpenses: 0, breakdown: [] })
    vi.mocked(getRecipientExpenseSummary).mockReset()
    vi.mocked(getRecipientExpenseSummary).mockResolvedValue([])
    vi.mocked(getOutstandingExpenses).mockReset()
    vi.mocked(getOutstandingExpenses).mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })
  // Pending income standalone line

  it('should_display_pending_income_section_for_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 60, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Pending income')).toBeDefined()
  })

  it('should_hide_pending_income_section_for_past_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 0, breakdown: [] })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-05' }),
    })
    render(jsx)
    expect(screen.queryByText('Pending income')).toBeNull()
  })

  it('should_display_pending_income_amount', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 60, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('$60.00')).toBeDefined()
  })

  it('should_render_info_popover_on_pending_income_line', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 60, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const row = screen.getByText('Pending income').closest('div')!
    expect(row.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  // Tab content smoke tests

  it('should_display_breakdown_tier_name', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 100,
      pendingIncome: 0,
      breakdown: [{ tierName: 'Premium', price: 50, lessonCount: 2, subtotal: 100, instructorCut: 0 }],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    expect(screen.getByText(/Premium/)).toBeDefined()
  })

  it('should_display_breakdown_net_unchanged_from_the_tiers_own_subtotal', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 0,
      pendingIncome: 0,
      breakdown: [{ tierName: 'Custom', price: null, lessonCount: 1, subtotal: 125, instructorCut: 25 }],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    const row = screen.getByText('Custom').closest('tr')!
    expect(within(row).getByText('$125.00')).toBeDefined()
  })

  it('should_display_empty_state_when_no_income', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 0, breakdown: [] })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    expect(screen.getByText(/no lessons/i)).toBeDefined()
  })

  it('should_not_render_a_non_lesson_income_row_in_the_tier_tab_body', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 300,
      pendingIncome: 0,
      breakdown: [{ tierName: NON_LESSON_INCOME_LABEL, price: null, lessonCount: 1, subtotal: 300, instructorCut: 0 }],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    expect(screen.queryByText(NON_LESSON_INCOME_LABEL)).toBeNull()
  })

})
