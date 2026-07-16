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
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary, NON_LESSON_INCOME_LABEL, NO_INSTRUCTOR_LABEL, NO_HORSE_LABEL, NO_RIDER_LABEL } from '@/lib/db/lesson-finances'
import { getOutstandingLessons, getOutstandingCancellationFees } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
import { getOutstandingExpenses } from '@/lib/db/expenses'
import { getExpenseFinancialSummary, getRecipientExpenseSummary } from '@/lib/db/expense-finances'
import FinancesPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', role: 'trainer' })

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

  it('should_throw_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    try { await FinancesPage({ params: Promise.resolve({ slug: 'unknown' }) }) } catch {}
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_throw_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    try { await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_throw_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    try { await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_throw_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    try { await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_page_for_manager', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Finances' })).toBeDefined()
  })

  // Summary cards removed (#971)

  it('should_not_display_gross_income_card', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Gross Income')).toBeNull()
  })

  it('should_not_display_total_expenses_card', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Total Expenses')).toBeNull()
  })

  it('should_not_display_net_income_card', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Net Income')).toBeNull()
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
      expect.any(Date)
    )
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
    expect(within(row).getByText('$120.00')).toBeDefined()
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

  it('should_use_explicit_valid_month_param', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-04' }),
    })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      new Date('2026-04-01T00:00:00.000Z'),
      expect.any(Date)
    )
  })

  it('should_default_to_current_month_when_month_param_is_invalid', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: 'garbage' }),
    })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      new Date('2026-06-01T00:00:00.000Z'),
      expect.any(Date)
    )
  })

  it('should_clamp_to_barn_creation_month_when_param_is_before_it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-03-01T00:00:00Z' }))
    await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2025-01' }),
    })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      'barn-1',
      new Date('2026-03-01T00:00:00.000Z'),
      expect.any(Date)
    )
  })

  it('should_clamp_to_current_month_when_param_is_in_future', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2030-01' }),
    })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      new Date('2026-06-01T00:00:00.000Z'),
      expect.any(Date)
    )
  })

  it('should_show_prev_link_when_not_at_barn_creation_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: '<' })).not.toBeNull()
  })

  it('should_link_prev_to_previous_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: '<' })?.getAttribute('href')).toBe('?month=2026-05')
  })

  it('should_not_show_prev_link_at_barn_creation_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-06-01T00:00:00Z' }))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: '<' })).toBeNull()
  })

  it('should_show_next_link_when_not_at_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-05' }),
    })
    render(jsx)
    expect(screen.queryByRole('link', { name: '>' })).not.toBeNull()
  })

  it('should_link_next_to_next_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-05' }),
    })
    render(jsx)
    expect(screen.queryByRole('link', { name: '>' })?.getAttribute('href')).toBe('?month=2026-06')
  })

  it('should_not_show_next_link_at_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: '>' })).toBeNull()
  })

  it('should_set_endDate_to_end_of_month_for_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      expect.any(Date),
      new Date('2026-07-01T00:00:00.000Z')
    )
  })

  it('should_set_endDate_to_last_moment_of_month_for_past_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-05' }),
    })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      expect.any(Date),
      new Date('2026-06-01T00:00:00.000Z')
    )
  })

  it('should_display_month_label_in_navigation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-04' }),
    })
    render(jsx)
    expect(screen.getByText('April 2026')).toBeDefined()
  })

  it('should_show_prev_link_when_viewing_january', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2025-12-01T00:00:00Z' }))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-01' }),
    })
    render(jsx)
    expect(screen.queryByRole('link', { name: '<' })).not.toBeNull()
  })

  it('should_link_prev_to_previous_year_when_viewing_january', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2025-12-01T00:00:00Z' }))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-01' }),
    })
    render(jsx)
    expect(screen.queryByRole('link', { name: '<' })?.getAttribute('href')).toBe('?month=2025-12')
  })

  it('should_show_next_link_when_viewing_december', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2025-12' }),
    })
    render(jsx)
    expect(screen.queryByRole('link', { name: '>' })).not.toBeNull()
  })

  it('should_link_next_to_next_year_when_viewing_december', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2025-12' }),
    })
    render(jsx)
    expect(screen.queryByRole('link', { name: '>' })?.getAttribute('href')).toBe('?month=2026-01')
  })

  it('should_style_prev_arrow_link_with_border_when_present', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-01-01T00:00:00Z' }))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const prevLink = screen.queryByRole('link', { name: '<' })
    expect(prevLink?.className).toContain('border')
  })

  it('should_style_next_arrow_link_with_border_when_present', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-05' }),
    })
    render(jsx)
    const nextLink = screen.queryByRole('link', { name: '>' })
    expect(nextLink?.className).toContain('border')
  })

  it('should_render_prev_placeholder_text_when_prev_arrow_absent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-06-01T00:00:00Z' }))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('<')).not.toBeNull()
  })

  it('should_not_render_prev_placeholder_as_link_when_prev_arrow_absent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-06-01T00:00:00Z' }))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: '<' })).toBeNull()
  })

  it('should_render_next_placeholder_text_when_next_arrow_absent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('>')).not.toBeNull()
  })

  it('should_not_render_next_placeholder_as_link_when_next_arrow_absent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('link', { name: '>' })).toBeNull()
  })

  it('should_not_show_outstanding_section_when_no_outstanding_lessons', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Outstanding Income')).toBeNull()
  })

  it('should_show_outstanding_section_when_outstanding_lessons_exist', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: ['Alice'], fee: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding Income')).toBeDefined()
  })

  it('should_highlight_outstanding_section_when_total_is_greater_than_zero', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: ['Alice'], fee: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const container = screen.getByText('Outstanding Income').closest('section')
    expect(container?.className).toMatch(/amber/)
  })

  it('should_not_highlight_outstanding_section_when_total_is_zero', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: ['Alice'], fee: 0 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const container = screen.getByText('Outstanding Income').closest('section')
    expect(container?.className).not.toMatch(/amber/)
  })

  it('should_render_info_button_on_outstanding_label', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: ['Alice'], fee: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const outstandingSection = screen.getByText('Outstanding Income').closest('section')
    expect(outstandingSection?.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_show_link_to_outstanding_route_when_outstanding_lessons_exist', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: [], fee: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /view all outstanding/i })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/finances/outstanding')
  })

  it('should_show_outstanding_section_when_only_outstanding_charges_exist', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding Income')).toBeDefined()
  })

  it('should_render_the_outstanding_charges_rider_name_when_only_outstanding_charges_exist', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Carol Rider')).toBeDefined()
  })

  it('should_include_outstanding_charges_in_outstanding_total', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByText('$500.00').length).toBeGreaterThanOrEqual(1)
  })

  it('should_show_outstanding_section_when_only_a_cancellation_fee_exists', async () => {
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([
      { id: 'lr-1', lessonId: 'lesson-2', lessonAt: '2026-05-10T10:00:00Z', instructorName: null, riderName: 'Erin Rider', fee: 50 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding Income')).toBeDefined()
    expect(screen.getByText('Cancellation Fee')).toBeDefined()
  })

  it('should_include_a_cancellation_fee_in_the_outstanding_total', async () => {
    vi.mocked(getOutstandingCancellationFees).mockResolvedValue([
      { id: 'lr-1', lessonId: 'lesson-2', lessonAt: '2026-05-10T10:00:00Z', instructorName: null, riderName: 'Erin Rider', fee: 50 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(1)
  })

  it('should_show_outstanding_expenses_section_when_outstanding_expenses_exist', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: '2026-05-01', expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding Expenses')).toBeDefined()
  })

  it('should_render_the_recipient_for_an_outstanding_expense', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: '2026-05-01', expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/Dr\. Smith/)).toBeDefined()
  })

  it('should_link_an_outstanding_expense_to_its_edit_page', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: '2026-05-01', expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /Dr\. Smith/ })).toHaveProperty('href', expect.stringContaining('/barn/green-acres/expenses/expense-1'))
  })

  it('should_not_show_outstanding_income_section_when_only_outstanding_expenses_exist', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: '2026-05-01', expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Outstanding Income')).toBeNull()
  })

  it('should_sum_only_known_amounts_in_the_outstanding_expenses_total', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: '2026-05-01', expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
      { id: 'expense-2', barn_id: 'barn-1', expense_date: '2026-05-02', expense_time: null, amount: 120, recipient: 'Feed Co', expense_type: 'Feed', notes: null, applies_to_all_horses: true, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const section = screen.getByText('Outstanding Expenses').closest('section')!
    expect(within(section).getByText('$120.00')).toBeDefined()
  })

  it('should_render_info_button_on_outstanding_expenses_label', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: '2026-05-01', expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const section = screen.getByText('Outstanding Expenses').closest('section')
    expect(section?.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_always_style_outstanding_expenses_section_amber', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: '2026-05-01', expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const section = screen.getByText('Outstanding Expenses').closest('section')
    expect(section?.className).toMatch(/amber/)
  })

  it('should_render_separator_before_tab_bar', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const tabBarWrapper = screen.getByRole('link', { name: 'By Horse' }).closest('div')!.parentElement!
    expect(tabBarWrapper.previousElementSibling?.tagName).toBe('HR')
  })

  // Tab bar

  it('should_render_tab_bar_with_by_tier_tab', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: 'By Tier' })).toBeDefined()
  })

  it('should_render_tab_bar_with_by_horse_tab', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: 'By Horse' })).toBeDefined()
  })

  it('should_render_tab_bar_with_by_rider_tab', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: 'By Rider' })).toBeDefined()
  })

  it('should_render_tab_bar_with_by_instructor_tab', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: 'By Instructor' })).toBeDefined()
  })

  it('should_default_to_horse_tab_when_no_tab_param', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'h-1', horseName: 'Whistler', totalIncome: 200 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Whistler')).toBeDefined()
  })

  it('should_show_tier_tab_content_when_tab_is_tier', async () => {
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
    expect(screen.getByText('Premium')).toBeDefined()
  })

  it('should_show_horse_tab_content_when_tab_is_horse', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'h-1', horseName: 'Shadowfax', totalIncome: 200 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    expect(screen.getByText('Shadowfax')).toBeDefined()
  })

  it('should_show_rider_tab_content_when_tab_is_rider', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([
      { riderId: 'r-1', riderName: 'Bob', totalIncome: 100 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider' }),
    })
    render(jsx)
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('should_show_trainer_tab_content_when_tab_is_trainer', async () => {
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: 't-1', trainerName: 'Jane Smith', totalIncome: 300, grossIncome: 300 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    expect(screen.getByText('Jane Smith')).toBeDefined()
  })

  it('should_show_empty_state_on_tier_tab_when_no_breakdown', async () => {
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

  it('should_show_empty_state_on_horse_tab_when_no_horse_activity', async () => {
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

  it('should_show_empty_state_on_rider_tab_when_no_rider_income', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider' }),
    })
    render(jsx)
    expect(screen.getByText('No rider income in June 2026.')).toBeDefined()
  })

  it('should_show_empty_state_on_trainer_tab_when_no_trainer_income', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    expect(screen.getByText('No trainer income in June 2026.')).toBeDefined()
  })

  it('should_not_render_a_non_lesson_income_row_in_the_trainer_tab_body', async () => {
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    expect(screen.queryByText(NON_LESSON_INCOME_LABEL)).toBeNull()
  })

  it('should_render_the_reconciliation_footer_on_the_trainer_tab_when_only_non_lesson_income_exists', async () => {
    // #971 review fix: a month with charge income but zero paid lessons used to fall
    // through to the "No trainer income" EmptyState instead of showing that income
    // reconciled under "Outside this view" — the tab's Total must never disappear.
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300, grossIncome: null },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    const { container } = render(jsx)
    expect(container.querySelector('tfoot')).not.toBeNull()
  })

  it('should_not_render_a_no_instructor_row_in_the_trainer_tab_body', async () => {
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: NO_INSTRUCTOR_LABEL, trainerName: NO_INSTRUCTOR_LABEL, totalIncome: 100, grossIncome: 100 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    expect(screen.queryByText(NO_INSTRUCTOR_LABEL)).toBeNull()
  })

  it('should_display_trainer_name', async () => {
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: 't-1', trainerName: 'Jane Smith', totalIncome: 300, grossIncome: 300 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    expect(screen.getByText('Jane Smith')).toBeDefined()
  })

  it('should_display_trainer_net_amount', async () => {
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: 't-1', trainerName: 'Jane Smith', totalIncome: 300, grossIncome: 350 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    const row = screen.getByText('Jane Smith').closest('tr')!
    expect(within(row).getByText('$300.00')).toBeDefined()
  })

  it('should_call_getTrainerIncomeSummary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getTrainerIncomeSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z')
    )
  })

  it('should_link_trainer_name_to_trainer_drilldown_with_month_param', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: 't-1', trainerName: 'Jane Smith', totalIncome: 300, grossIncome: 300 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    const link = screen.getByRole('link', { name: 'Jane Smith' })
    expect(link.getAttribute('href')).toBe('/barn/green-acres/finances/trainers/t-1?month=2026-06')
  })

  it('should_preserve_month_param_in_tab_links_when_viewing_past_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-05' }),
    })
    render(jsx)
    const horseTab = screen.getByRole('link', { name: 'By Horse' })
    expect(horseTab.getAttribute('href')).toContain('month=2026-05')
  })

  it('should_preserve_tab_param_in_prev_month_link', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    const prevLink = screen.queryByRole('link', { name: '<' })
    expect(prevLink?.getAttribute('href')).toContain('tab=tier')
  })

  it('should_preserve_tab_param_in_next_month_link', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider', month: '2026-05' }),
    })
    render(jsx)
    const nextLink = screen.queryByRole('link', { name: '>' })
    expect(nextLink?.getAttribute('href')).toContain('tab=rider')
  })

  it('should_not_include_tab_param_in_month_links_for_default_horse_tab', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const prevLink = screen.queryByRole('link', { name: '<' })
    expect(prevLink?.getAttribute('href')).not.toContain('tab=')
  })

  it('should_mark_active_tab_with_filled_background', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const horseTab = screen.getByRole('link', { name: 'By Horse' })
    expect(horseTab.className).toContain('bg-zinc-900')
  })

  it('should_render_by_horse_pill_first', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const pills = screen.getAllByRole('link', { name: /^By / })
    expect(pills[0].textContent).toBe('By Horse')
  })

  it('should_display_zero_expenses_for_horse_with_no_expenses', async () => {
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
    expect(within(row).getByText('$0.00')).toBeDefined()
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
    expect(within(row).getByText('($60.00)')).toBeDefined()
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
      expect(await totalRowCells('tier')).toEqual(['Total', '$1,950.00', '$7,290.00', '($5,340.00)'])
    })

    it('should_reconcile_gross_expenses_net_totals_on_the_horse_tab', async () => {
      expect(await totalRowCells('horse')).toEqual(['Total', '$1,950.00', '$7,290.00', '($5,340.00)'])
    })

    it('should_reconcile_gross_expenses_net_totals_on_the_rider_tab', async () => {
      expect(await totalRowCells('rider')).toEqual(['Total', '$1,950.00', '$7,290.00', '($5,340.00)'])
    })

    it('should_reconcile_gross_expenses_net_totals_on_the_trainer_tab', async () => {
      expect(await totalRowCells('trainer')).toEqual(['Total', '$1,950.00', '$7,290.00', '($5,340.00)'])
    })

    it('should_reconcile_gross_expenses_net_totals_on_the_recipient_tab', async () => {
      expect(await totalRowCells('recipient')).toEqual(['Total', '—', '$7,290.00', '—'])
    })
  })

  it('should_surface_an_orphaned_expense_as_unattributed_on_the_horse_tab_instead_of_dropping_it', async () => {
    // The $90 gap: totalExpenses includes it, the by-horse breakdown doesn't (deleted
    // horse_expenses record, collected transaction kept — see deleteExpense).
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
    // (deleted horse_expenses, collected transaction kept) record has zero real
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
