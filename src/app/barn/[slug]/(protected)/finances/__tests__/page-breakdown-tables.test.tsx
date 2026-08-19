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

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect, useRouter: vi.fn(() => ({ refresh: vi.fn() })) }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary, NO_HORSE_LABEL, NO_RIDER_LABEL } from '@/lib/db/lesson-finances'
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
  it('should_display_horse_name', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_display_horse_gross_amount', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    const row = screen.getByText('Thunderbolt').closest('tr')!
    const grossCell = row.querySelectorAll('td')[1]
    expect(grossCell.textContent).toBe('$150.00')
  })

  it('should_style_horse_name_link_with_persistent_underline', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    const link = screen.getByRole('link', { name: 'Thunderbolt' })
    expect(link.className).toContain('underline')
  })

  it('should_display_empty_state_when_no_horse_activity', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    expect(screen.getByText(/no horse activity/i)).toBeDefined()
  })

  it('should_not_render_a_no_horse_row_in_the_horse_tab_body', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: NO_HORSE_LABEL, horseName: NO_HORSE_LABEL, totalIncome: 80 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    expect(screen.queryByText(NO_HORSE_LABEL)).toBeNull()
  })

  it('should_call_getFinancialSummary_with_first_day_of_current_month_as_start_date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      new Date('2026-06-01T00:00:00.000Z'),
      expect.any(Date),
      mockBarn.timezone
    )
  })

  it('should_call_getOutstandingCharges_with_the_barns_timezone', async () => {
    await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getOutstandingCharges)).toHaveBeenCalledWith(mockBarn.id, mockBarn.timezone)
  })

  it('should_display_empty_state_with_current_month_and_year', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 0, breakdown: [] })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    expect(screen.getByText('No lessons in June 2026.')).toBeDefined()
  })

  it('should_display_horse_activity_empty_state_with_current_month_and_year', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    expect(screen.getByText('No horse activity in June 2026.')).toBeDefined()
  })

  it('should_display_rider_name', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([
      { riderId: 'rider-1', riderName: 'Alice', totalIncome: 75 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider' }),
    })
    render(jsx)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_display_rider_gross_amount_in_both_gross_and_net_cells', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([
      { riderId: 'rider-1', riderName: 'Alice', totalIncome: 75 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider' }),
    })
    render(jsx)
    expect(screen.getAllByText('$75.00').length).toBeGreaterThanOrEqual(2)
  })

  it('should_style_rider_name_link_with_persistent_underline', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([
      { riderId: 'rider-1', riderName: 'Alice', totalIncome: 75 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider' }),
    })
    render(jsx)
    const link = screen.getByRole('link', { name: 'Alice' })
    expect(link.className).toContain('underline')
  })

  it('should_display_empty_state_when_no_rider_income', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider' }),
    })
    render(jsx)
    expect(screen.getByText(/no rider income/i)).toBeDefined()
  })

  it('should_not_render_a_no_rider_row_in_the_rider_tab_body', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([
      { riderId: NO_RIDER_LABEL, riderName: NO_RIDER_LABEL, totalIncome: 80 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider' }),
    })
    render(jsx)
    expect(screen.queryByText(NO_RIDER_LABEL)).toBeNull()
  })

  it('should_display_recipient_name', async () => {
    vi.mocked(getRecipientExpenseSummary).mockResolvedValue([
      { recipient: 'Dr. Smith', totalExpenses: 120 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'recipient' }),
    })
    render(jsx)
    expect(screen.getByText('Dr. Smith')).toBeDefined()
  })

  it('should_display_recipient_expense_amount', async () => {
    vi.mocked(getRecipientExpenseSummary).mockResolvedValue([
      { recipient: 'Dr. Smith', totalExpenses: 120 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'recipient' }),
    })
    render(jsx)
    const row = screen.getByText('Dr. Smith').closest('tr')!
    expect(within(row).getByText('($120.00)')).toBeDefined()
  })

  it('should_link_recipient_name_to_encoded_drill_down_with_month_param', async () => {
    vi.mocked(getRecipientExpenseSummary).mockResolvedValue([
      { recipient: 'Dr. Smith & Co', totalExpenses: 120 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'recipient', month: '2026-05' }),
    })
    render(jsx)
    const link = screen.getByRole('link', { name: 'Dr. Smith & Co' })
    expect(link.getAttribute('href')).toBe(`/barn/green-acres/finances/expenses/${encodeURIComponent('Dr. Smith & Co')}?month=2026-05`)
  })

  it('should_display_empty_state_when_no_recipient_expenses', async () => {
    vi.mocked(getRecipientExpenseSummary).mockResolvedValue([])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'recipient' }),
    })
    render(jsx)
    expect(screen.getByText(/no expenses/i)).toBeDefined()
  })

})
