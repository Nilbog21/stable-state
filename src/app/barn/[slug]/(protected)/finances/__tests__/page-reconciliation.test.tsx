import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary } from '@/lib/db/lesson-finances'
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
  it('should_display_dash_for_horse_with_no_expenses', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'h-1', horseName: 'Copper', totalIncome: 100 },
    ])
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({ totalExpenses: 0, breakdown: [] })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    const row = screen.getByText('Copper').closest('tr')!
    const expensesCell = row.querySelectorAll('td')[2]
    expect(expensesCell.textContent).toBe('—')
  })

  it('should_display_expense_only_horse_with_zero_income', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({
      totalExpenses: 60,
      breakdown: [{ horseId: 'h-2', horseName: 'Biscuit', totalExpenses: 60 }],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    expect(screen.getByText('Biscuit')).toBeDefined()
  })

  it('should_break_horse_row_income_ties_alphabetically', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'h-1', horseName: 'Zephyr', totalIncome: 100 },
      { horseId: 'h-2', horseName: 'Amber', totalIncome: 100 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    const names = screen.getAllByRole('link', { name: /Zephyr|Amber/ }).map((el) => el.textContent)
    expect(names).toEqual(['Amber', 'Zephyr'])
  })

  it('should_display_negative_net_for_expense_only_horse', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({
      totalExpenses: 60,
      breakdown: [{ horseId: 'h-2', horseName: 'Biscuit', totalExpenses: 60 }],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    const row = screen.getByText('Biscuit').closest('tr')!
    const netCell = row.querySelectorAll('td')[3]
    expect(netCell.textContent).toBe('($60.00)')
  })

  // Reconciliation wiring (#971)

  describe('reconciliation totals identical across all five tables', () => {
    // Mirrors the real dev-barn numbers verified via SQL: $1,950 gross lesson income,
    // $425 instructor cut, $6,865 horse expenses ($6,775 attributable + $90 orphaned).
    beforeEach(() => {
      vi.mocked(getFinancialSummary).mockResolvedValue({
        collectedIncome: 1525,
        pendingIncome: 0,
        breakdown: [{ tierName: 'Custom', price: null, lessonCount: 1, subtotal: 1525, instructorCut: 425 }],
      })
      vi.mocked(getExpenseFinancialSummary).mockResolvedValue({
        totalExpenses: 6865,
        breakdown: [{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 6775 }],
      })
      vi.mocked(getHorseIncomeSummary).mockResolvedValue([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 1950 }])
      vi.mocked(getRiderIncomeSummary).mockResolvedValue([{ riderId: 'rider-1', riderName: 'Alice', totalIncome: 1950 }])
      vi.mocked(getTrainerIncomeSummary).mockResolvedValue([{ trainerId: 'trainer-1', trainerName: 'Jane', totalIncome: 1525, grossIncome: 1950 }])
      vi.mocked(getRecipientExpenseSummary).mockResolvedValue([{ recipient: 'Riverside Vet Clinic', totalExpenses: 6775 }])
    })

    async function totalRowCells(tab: string) {
      const jsx = await FinancesPage({
        params: Promise.resolve({ slug: 'green-acres' }),
        searchParams: Promise.resolve({ tab }),
      })
      render(jsx)
      const totalRow = screen.getByText('Total').closest('tr')!
      return Array.from(totalRow.querySelectorAll('td')).map((td) => td.textContent)
    }

    it('should_reconcile_gross_expenses_net_totals_on_the_tier_tab', async () => {
      expect(await totalRowCells('tier')).toEqual(['Total', '$1,950.00', '($7,290.00)', '($5,340.00)'])
    })

    it('should_reconcile_gross_expenses_net_totals_on_the_horse_tab', async () => {
      expect(await totalRowCells('horse')).toEqual(['Total', '$1,950.00', '($7,290.00)', '($5,340.00)'])
    })

    it('should_reconcile_gross_expenses_net_totals_on_the_rider_tab', async () => {
      expect(await totalRowCells('rider')).toEqual(['Total', '$1,950.00', '($7,290.00)', '($5,340.00)'])
    })

    it('should_reconcile_gross_expenses_net_totals_on_the_trainer_tab', async () => {
      expect(await totalRowCells('trainer')).toEqual(['Total', '$1,950.00', '($7,290.00)', '($5,340.00)'])
    })

    it('should_reconcile_gross_expenses_net_totals_on_the_recipient_tab', async () => {
      expect(await totalRowCells('recipient')).toEqual(['Total', '—', '($7,290.00)', '—'])
    })
  })

  it('should_surface_an_orphaned_expense_as_unattributed_on_the_horse_tab_instead_of_dropping_it', async () => {
    // The $90 gap: totalExpenses includes it, the by-horse breakdown doesn't (deleted
    // appointments record, collected transaction kept — see deleteExpense).
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({
      totalExpenses: 6865,
      breakdown: [{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 6775 }],
    })
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 1950 }])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    const unattributedRow = screen.getByText('Unattributed').closest('tr')!
    expect(unattributedRow.textContent).toContain('$90.00')
  })

  it('should_surface_the_same_orphaned_expense_as_unattributed_on_the_recipient_tab', async () => {
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({
      totalExpenses: 6865,
      breakdown: [{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 6775 }],
    })
    vi.mocked(getRecipientExpenseSummary).mockResolvedValue([{ recipient: 'Riverside Vet Clinic', totalExpenses: 6775 }])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'recipient' }),
    })
    render(jsx)
    const unattributedRow = screen.getByText('Unattributed').closest('tr')!
    expect(unattributedRow.textContent).toContain('$90.00')
  })

  it('should_render_the_reconciliation_footer_on_the_recipient_tab_when_every_expense_that_month_is_orphaned', async () => {
    // #971 review fix: a month where the only expense activity is a fully orphaned
    // (deleted appointments row, collected transaction kept) record has zero real
    // recipient rows — the tab's Unattributed total must still surface, not vanish
    // behind the "No expenses" EmptyState.
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({ totalExpenses: 90, breakdown: [] })
    vi.mocked(getRecipientExpenseSummary).mockResolvedValue([])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'recipient' }),
    })
    render(jsx)
    const unattributedRow = screen.getByText('Unattributed').closest('tr')!
    expect(unattributedRow.textContent).toContain('$90.00')
  })
})
