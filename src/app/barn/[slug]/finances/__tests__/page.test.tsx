import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))
vi.mock('@/lib/db/lessons', () => ({ getFinancialSummary: vi.fn(), getHorseIncomeSummary: vi.fn(), getRiderIncomeSummary: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary } from '@/lib/db/lessons'
import FinancesPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', role: 'trainer' })

describe('FinancesPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getFinancialSummary).mockResolvedValue({ totalIncome: 0, breakdown: [] })
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    await expect(FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_page_for_manager', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/green acres/i)).toBeDefined()
  })

  it('should_display_total_income', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      totalIncome: 225,
      breakdown: [
        { fee: 75, lessonCount: 1, subtotal: 75 },
        { fee: 50, lessonCount: 3, subtotal: 150 },
      ],
    })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/225/)).toBeDefined()
  })

  it('should_display_breakdown_table_rows', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({
      totalIncome: 350,
      breakdown: [
        { fee: 50, lessonCount: 2, subtotal: 100 },
        { fee: 75, lessonCount: 2, subtotal: 150 },
      ],
    })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('$50.00')).toBeDefined()
    expect(screen.getByText('$75.00')).toBeDefined()
  })

  it('should_display_empty_state_when_no_income', async () => {
    vi.mocked(getFinancialSummary).mockResolvedValue({ totalIncome: 0, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no lessons/i)).toBeDefined()
  })

  it('should_display_income_by_horse_heading', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/income by horse/i)).toBeDefined()
  })

  it('should_display_horse_name', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Thunderbolt')).toBeDefined()
  })

  it('should_display_horse_income_amount', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([
      { horseId: 'horse-1', horseName: 'Thunderbolt', totalIncome: 150 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('$150.00')).toBeDefined()
  })

  it('should_display_empty_state_when_no_horse_income', async () => {
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no horse income/i)).toBeDefined()
  })

  it('should_display_total_income_label_with_current_month_and_year', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/total income \(june 2026\)/i)).toBeDefined()
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
    vi.mocked(getFinancialSummary).mockResolvedValue({ totalIncome: 0, breakdown: [] })
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No lessons in June 2026.')).toBeDefined()
  })

  it('should_display_horse_income_empty_state_with_current_month_and_year', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    vi.mocked(getHorseIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No horse income in June 2026.')).toBeDefined()
  })

  it('should_display_income_by_rider_heading', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/income by rider/i)).toBeDefined()
  })

  it('should_display_rider_name', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([
      { riderId: 'rider-1', riderName: 'Alice', totalIncome: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_display_rider_income_amount', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([
      { riderId: 'rider-1', riderName: 'Alice', totalIncome: 75 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('$75.00')).toBeDefined()
  })

  it('should_display_empty_state_when_no_rider_income', async () => {
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no rider income/i)).toBeDefined()
  })

  it('should_display_rider_income_empty_state_with_current_month_and_year', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T12:00:00Z'))
    vi.mocked(getRiderIncomeSummary).mockResolvedValue([])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
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
    const prevLink = screen.queryByText('←')
    expect(prevLink).not.toBeNull()
    expect(prevLink?.closest('a')?.getAttribute('href')).toBe('?month=2026-05')
  })

  it('should_not_show_prev_link_at_barn_creation_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn({ created_at: '2026-06-01T00:00:00Z' }))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('←')).toBeNull()
  })

  it('should_show_next_link_when_not_at_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({ month: '2026-05' }),
    })
    render(jsx)
    const nextLink = screen.queryByText('→')
    expect(nextLink).not.toBeNull()
    expect(nextLink?.closest('a')?.getAttribute('href')).toBe('?month=2026-06')
  })

  it('should_not_show_next_link_at_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('→')).toBeNull()
  })

  it('should_set_endDate_to_now_for_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getFinancialSummary)).toHaveBeenCalledWith(
      mockBarn.id,
      expect.any(Date),
      new Date('2026-06-15T12:00:00.000Z')
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
      new Date('2026-05-31T23:59:59.999Z')
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
})
