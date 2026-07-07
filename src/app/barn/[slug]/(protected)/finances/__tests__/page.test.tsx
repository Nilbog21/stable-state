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
    getOutstandingLessons: vi.fn(),
    getHorseIncomeSummary: vi.fn(),
    getRiderIncomeSummary: vi.fn(),
    getTrainerIncomeSummary: vi.fn(),
  }
})
vi.mock('@/lib/db/agreements', () => ({ getOutstandingCharges: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({ getExpenseFinancialSummary: vi.fn() }))
vi.mock('@/app/actions/lessons', () => ({ updatePaymentTypeAction: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect, useRouter: vi.fn(() => ({ refresh: vi.fn() })) }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getFinancialSummary, getOutstandingLessons, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary, NON_LESSON_INCOME_LABEL } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import { getExpenseFinancialSummary } from '@/lib/db/expenses'
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
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([])
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([])
    vi.mocked(getExpenseFinancialSummary).mockReset()
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({ totalExpenses: 0, breakdown: [] })
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
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    try { await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_throw_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    try { await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_page_for_manager', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Finances' })).toBeDefined()
  })

  it('should_display_collected_income', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 225,
      pendingIncome: 0,
      breakdown: [
        { tierName: 'Standard', price: 75, lessonCount: 1, subtotal: 75, instructorCut: 0 },
        { tierName: 'Basic', price: 50, lessonCount: 3, subtotal: 150, instructorCut: 0 },
      ],
    })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const section = screen.getByText('Collected income').closest('section')!
    expect(within(section).getByText('$225.00')).toBeDefined()
  })

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

  it('should_display_breakdown_subtotal', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 0,
      pendingIncome: 0,
      breakdown: [{ tierName: 'Custom', price: null, lessonCount: 1, subtotal: 125, instructorCut: 0 }],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    expect(screen.getByText('$125.00')).toBeDefined()
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

  it('should_display_horse_income_amount', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    const row = screen.getByText('Thunderbolt').closest('tr')!
    const incomeCell = row.querySelectorAll('td')[1]
    expect(incomeCell.textContent).toBe('$150.00')
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

  it('should_display_collected_income_label_without_month_suffix', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Collected income')).toBeDefined()
  })

  it('should_call_getFinancialSummary_with_first_day_of_current_month_as_start_date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      new Date('2026-06-01T00:00:00.000Z'),
      expect.any(Date),
      mockBarn.instructor_cut
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

  it('should_display_rider_income_amount', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([
      { riderId: 'rider-1', riderName: 'Alice', totalIncome: 75 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'rider' }),
    })
    render(jsx)
    expect(screen.getByText('$75.00')).toBeDefined()
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

  it('should_display_rider_income_empty_state_with_current_month_and_year', async () => {
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
      mockBarn.instructor_cut
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
      mockBarn.instructor_cut
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
      expect.any(Date),
      25
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
      mockBarn.instructor_cut
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
      new Date('2026-07-01T00:00:00.000Z'),
      mockBarn.instructor_cut
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
      mockBarn.instructor_cut
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

  it('should_display_collected_income_label_instead_of_total_income', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 150,
      pendingIncome: 0,
      breakdown: [],
    } as any)
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/collected income/i)).toBeDefined()
  })

  it('should_not_display_total_income_label', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText(/total income/i)).toBeNull()
  })

  it('should_display_pending_income_section_for_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 60, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Pending income (from scheduled lessons)')).toBeDefined()
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
    expect(screen.queryByText('Pending income (from scheduled lessons)')).toBeNull()
  })

  it('should_display_pending_income_amount', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 60, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('$60.00')).toBeDefined()
  })

  it('should_not_show_outstanding_section_when_no_outstanding_lessons', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Outstanding')).toBeNull()
  })

  it('should_show_outstanding_section_when_outstanding_lessons_exist', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: ['Alice'], fee: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding')).toBeDefined()
  })

  it('should_highlight_outstanding_section_when_total_is_greater_than_zero', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: ['Alice'], fee: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const container = screen.getByText('Outstanding').closest('section')
    expect(container?.className).toMatch(/amber/)
  })

  it('should_not_highlight_outstanding_section_when_total_is_zero', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: ['Alice'], fee: 0 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const container = screen.getByText('Outstanding').closest('section')
    expect(container?.className).not.toMatch(/amber/)
  })

  it('should_render_collected_income_before_pending_income', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 100, pendingIncome: 50, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const collected = screen.getByText('Collected income').closest('section')!
    const pending = screen.getByText(/pending income/i).closest('section')!
    expect(collected.compareDocumentPosition(pending)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('should_render_total_expenses_after_collected_income', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const collected = screen.getByText('Collected income').closest('section')!
    const totalExpenses = screen.getByText('Total Expenses').closest('section')!
    expect(collected.compareDocumentPosition(totalExpenses)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('should_render_net_after_total_expenses', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const totalExpenses = screen.getByText('Total Expenses').closest('section')!
    const net = screen.getByText('Net').closest('section')!
    expect(totalExpenses.compareDocumentPosition(net)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('should_render_pending_income_after_net', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 50, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const net = screen.getByText('Net').closest('section')!
    const pending = screen.getByText(/pending income/i).closest('section')!
    expect(net.compareDocumentPosition(pending)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('should_display_total_expenses_label', async () => {
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({ totalExpenses: 80, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Total Expenses')).toBeDefined()
  })

  it('should_display_total_expenses_amount', async () => {
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({ totalExpenses: 80, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('$80.00')).toBeDefined()
  })

  it('should_display_net_label', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Net')).toBeDefined()
  })

  it('should_display_net_as_collected_minus_total_expenses', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 200, pendingIncome: 0, breakdown: [] })
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({ totalExpenses: 80, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('$120.00')).toBeDefined()
  })

  it('should_display_negative_net_in_parens', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 50, pendingIncome: 0, breakdown: [] })
    vi.mocked(getExpenseFinancialSummary).mockResolvedValue({ totalExpenses: 80, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('($30.00)')).toBeDefined()
  })

  it('should_render_info_button_on_outstanding_label', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([
      { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: null, rider_names: ['Alice'], fee: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const outstandingSection = screen.getByText('Outstanding').closest('section')
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
      { id: 'charge-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding')).toBeDefined()
  })

  it('should_render_the_outstanding_charges_rider_name_when_only_outstanding_charges_exist', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Carol Rider')).toBeDefined()
  })

  it('should_include_outstanding_charges_in_outstanding_total', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', period: '2026-05-01', kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByText('$500.00').length).toBeGreaterThanOrEqual(1)
  })

  it('should_render_info_button_on_pending_label', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getFinancialSummary).mockResolvedValue({ collectedIncome: 0, pendingIncome: 50, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const pendingSection = screen.getByText(/pending income/i).closest('section')
    expect(pendingSection?.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_render_info_button_on_collected_label', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const collectedSection = screen.getByText(/collected income/i).closest('section')
    expect(collectedSection?.querySelector('button[aria-label="Info"]')).not.toBeNull()
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

  it('should_render_tab_bar_with_by_trainer_tab', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: 'By Trainer' })).toBeDefined()
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
      { trainerId: 't-1', trainerName: 'Jane Smith', totalIncome: 300 },
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

  it('should_render_non_lesson_income_row_with_info_popover_on_tier_tab', async () => {
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
    const row = screen.getByText(NON_LESSON_INCOME_LABEL).closest('tr')
    expect(row?.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_render_non_lesson_income_row_with_info_popover_on_trainer_tab', async () => {
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: 300 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    const row = screen.getByText(NON_LESSON_INCOME_LABEL).closest('tr')
    expect(row?.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_show_dash_for_custom_tier_price', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 100,
      pendingIncome: 0,
      breakdown: [{ tierName: 'Custom', price: null, lessonCount: 1, subtotal: 100, instructorCut: 25 }],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_show_formatted_price_for_named_tier', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      collectedIncome: 150,
      pendingIncome: 0,
      breakdown: [{ tierName: 'Standard', price: 75, lessonCount: 2, subtotal: 150, instructorCut: 0 }],
    })
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'tier' }),
    })
    render(jsx)
    expect(screen.getByText('$75.00')).toBeDefined()
  })

  it('should_display_trainer_name', async () => {
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: 't-1', trainerName: 'Jane Smith', totalIncome: 300 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    expect(screen.getByText('Jane Smith')).toBeDefined()
  })

  it('should_display_trainer_income_amount', async () => {
    vi.mocked(getTrainerIncomeSummary).mockResolvedValue([
      { trainerId: 't-1', trainerName: 'Jane Smith', totalIncome: 300 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'trainer' }),
    })
    render(jsx)
    expect(screen.getByText('$300.00')).toBeDefined()
  })

  it('should_call_getTrainerIncomeSummary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getTrainerIncomeSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z'),
      mockBarn.instructor_cut
    )
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

  it('should_render_by_horse_table_expenses_header', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'h-1', horseName: 'Copper', totalIncome: 100 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    expect(screen.getByRole('columnheader', { name: 'Expenses' })).toBeDefined()
  })

  it('should_render_by_horse_table_net_header', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'h-1', horseName: 'Copper', totalIncome: 100 },
    ])
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ tab: 'horse' }),
    })
    render(jsx)
    expect(screen.getByRole('columnheader', { name: 'Net' })).toBeDefined()
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
})
