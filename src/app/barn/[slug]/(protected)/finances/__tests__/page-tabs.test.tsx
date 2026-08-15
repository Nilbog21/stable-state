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
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary, NON_LESSON_INCOME_LABEL, NO_INSTRUCTOR_LABEL } from '@/lib/db/lesson-finances'
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

  it('should_show_empty_state_on_tier_tab_when_every_tier_row_is_the_771_zero_backfill', async () => {
    // #971 review fix: #771 backfills a $0 row for every active barn tier regardless of
    // lesson activity, so `breakdown.length > 0` is true even with zero real collected
    // income that month — the gate must check for non-zero subtotal/instructorCut instead.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 0,
      pendingIncome: 0,
      breakdown: [
        { tierName: 'Standard', price: 50, lessonCount: 0, subtotal: 0, instructorCut: 0 },
        { tierName: 'Premium', price: 75, lessonCount: 0, subtotal: 0, instructorCut: 0 },
      ],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    expect(screen.getByText('No lessons in June 2026.')).toBeDefined()
  })

  it('should_show_tier_table_not_empty_state_when_only_charge_income_exists', async () => {
    // A boarding/lease-only month has zero real tier rows (no lessons at all, not even
    // #771's zero-backfill — no active tiers were mocked here), but real charge income
    // still exists via the NON_LESSON_INCOME_LABEL synthetic row. The gate must count
    // this as activity so the table (and its Outside-this-view reconciliation) renders.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
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
    expect(screen.queryByText('No lessons in June 2026.')).toBeNull()
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

})
