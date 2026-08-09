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
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary } from '@/lib/db/lesson-finances'
import { getOutstandingLessons, getOutstandingCancellationFees } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
import { getOutstandingExpenses } from '@/lib/db/expenses'
import { getExpenseFinancialSummary, getRecipientExpenseSummary } from '@/lib/db/expense-finances'
import FinancesPage from '../page'
import { calendarDate } from '@/lib/local-day'

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
      { id: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding Income')).toBeDefined()
  })

  it('should_render_the_outstanding_charges_rider_name_when_only_outstanding_charges_exist', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), kind: 'board', riderName: 'Carol Rider', fee: 500 },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Carol Rider')).toBeDefined()
  })

  it('should_include_outstanding_charges_in_outstanding_total', async () => {
    vi.mocked(getOutstandingCharges).mockResolvedValue([
      { id: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-05-01'), kind: 'board', riderName: 'Carol Rider', fee: 500 },
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
      { id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding Expenses')).toBeDefined()
  })

  it('should_render_the_recipient_for_an_outstanding_expense', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/Dr\. Smith/)).toBeDefined()
  })

  it('should_link_an_outstanding_expense_to_its_edit_page', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('link', { name: /Dr\. Smith/ })).toHaveProperty('href', expect.stringContaining('/barn/green-acres/expenses/expense-1'))
  })

  it('should_not_show_outstanding_income_section_when_only_outstanding_expenses_exist', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Outstanding Income')).toBeNull()
  })

  it('should_sum_only_known_amounts_in_the_outstanding_expenses_total', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
      { id: 'expense-2', barn_id: 'barn-1', expense_date: calendarDate('2026-05-02'), expense_time: null, amount: 120, recipient: 'Feed Co', expense_type: 'Feed', notes: null, applies_to_all_horses: true, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const section = screen.getByText('Outstanding Expenses').closest('section')!
    expect(within(section).getByText('$120.00')).toBeDefined()
  })

  it('should_render_info_button_on_outstanding_expenses_label', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const section = screen.getByText('Outstanding Expenses').closest('section')
    expect(section?.querySelector('button[aria-label="Info"]')).not.toBeNull()
  })

  it('should_always_style_outstanding_expenses_section_amber', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const section = screen.getByText('Outstanding Expenses').closest('section')
    expect(section?.className).toMatch(/amber/)
  })

})
