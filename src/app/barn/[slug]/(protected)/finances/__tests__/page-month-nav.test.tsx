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
      expect.any(Date),
      mockBarn.timezone
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
      expect.any(Date),
      mockBarn.timezone
    )
  })

  it('should_clamp_to_barn_creation_month_when_param_is_before_it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-03-01T12:00:00Z' }))
    await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2025-01' }),
    })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      'barn-1',
      new Date('2026-03-01T00:00:00.000Z'),
      expect.any(Date),
      mockBarn.timezone
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
      expect.any(Date),
      mockBarn.timezone
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
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-06-01T12:00:00Z' }))
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
      new Date('2026-07-01T00:00:00.000Z'),
      mockBarn.timezone
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
      new Date('2026-06-01T00:00:00.000Z'),
      mockBarn.timezone
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
    // Two matches since #1550 — the pager's own label, and the Monthly Breakdown accordion's
    // `hint`, which names the month the section is scoped to. (That section is always open, so
    // its hint is a restatement rather than the collapsed-row preview the other two carry.)
    // This test owns the pager one; `page-outstanding.test.tsx` owns the hint.
    expect(screen.getAllByText('April 2026').length).toBe(2)
  })

  it('should_show_prev_link_when_viewing_january', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2025-12-01T12:00:00Z' }))
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
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2025-12-01T12:00:00Z' }))
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
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-01-01T12:00:00Z' }))
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
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-06-01T12:00:00Z' }))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('<')).not.toBeNull()
  })

  it('should_not_render_prev_placeholder_as_link_when_prev_arrow_absent', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-06-01T12:00:00Z' }))
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

})
