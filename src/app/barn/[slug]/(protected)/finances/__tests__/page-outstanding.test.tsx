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
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary } from '@/lib/db/lesson-finances'
import { getOutstandingLessons, getOutstandingCancellationFees } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
import { getOutstandingExpenses } from '@/lib/db/expenses'
import { getExpenseFinancialSummary, getRecipientExpenseSummary } from '@/lib/db/expense-finances'
import FinancesPage from '../page'
import { calendarDate } from '@/lib/local-day'
import { resolveFinancesMonth } from '@/lib/finances-month'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

/**
 * The `<details>` an `AccordionSection` renders, found by its title. #1550 replaced the three
 * flat `<section>`s these tests used to reach for with three accordions, so every scoped read
 * below goes through this rather than `.closest('section')`.
 */
function section(title: string): HTMLDetailsElement {
  return screen.getByText(title).closest('details')!
}

/** A section's collapsed-row payload preview — the `hint` sibling of its title `<h2>`. */
function hintOf(title: string): string {
  return screen.getByText(title).nextElementSibling?.textContent ?? ''
}

/**
 * A section's headline figure. Read structurally rather than by its text, because the same amount
 * can also appear in a Fee cell of the table below it.
 *
 * The bold `<p>`, not the first one: #1550 put a description ahead of the figure, and "first `<p>`
 * in the body" silently became the prose — five assertions started comparing a sentence to a
 * dollar amount.
 */
function totalOf(title: string): HTMLParagraphElement {
  return section(title).querySelector('p.font-bold')!
}

const OUTSTANDING_LESSON = {
  id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z',
  instructor_name: null, rider_names: ['Alice'], fee: 75,
}

const OUTSTANDING_EXPENSE = {
  id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null,
  amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null,
  applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '',
}

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
  // -------------------------------------------------------------------------
  // #1550 — the three accordion sections
  // -------------------------------------------------------------------------

  it('should_render_three_accordion_sections_in_order', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    const { container } = render(jsx)
    const titles = [...container.querySelectorAll('details > summary h2')].map((h) => h.textContent)
    expect(titles).toEqual(['Outstanding Income', 'Outstanding Expenses', 'Monthly Breakdown'])
  })

  it('should_open_outstanding_income_section_when_outstanding_lessons_exist', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([OUTSTANDING_LESSON])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(section('Outstanding Income').open).toBe(true)
  })

  // Renders rather than disappears (the pre-#1550 behaviour), so the page keeps one shape
  // whatever the data — the flat-wall complaint the issue came from was partly that it didn't.
  it('should_collapse_outstanding_income_section_when_nothing_is_outstanding', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(section('Outstanding Income').open).toBe(false)
  })

  it('should_hint_none_on_an_empty_outstanding_income_section', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(hintOf('Outstanding Income')).toBe('None')
  })

  it('should_hint_the_unpaid_count_on_the_outstanding_income_section', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([OUTSTANDING_LESSON])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(hintOf('Outstanding Income')).toBe('1 unpaid')
  })

  it('should_open_outstanding_expenses_section_when_outstanding_expenses_exist', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([OUTSTANDING_EXPENSE])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(section('Outstanding Expenses').open).toBe(true)
  })

  it('should_collapse_outstanding_expenses_section_when_nothing_is_outstanding', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(section('Outstanding Expenses').open).toBe(false)
  })

  it('should_hint_none_on_an_empty_outstanding_expenses_section', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(hintOf('Outstanding Expenses')).toBe('None')
  })

  it('should_hint_the_unresolved_count_on_the_outstanding_expenses_section', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([OUTSTANDING_EXPENSE])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(hintOf('Outstanding Expenses')).toBe('1 to resolve')
  })

  // Always open: unlike the two above it always has content — a table, or the EmptyState that
  // stands in for one.
  it('should_open_the_monthly_breakdown_section', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(section('Monthly Breakdown').open).toBe(true)
  })

  it('should_hint_the_month_label_on_the_monthly_breakdown_section', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const { monthLabel } = resolveFinancesMonth(undefined, mockBarn.created_at, mockBarn.timezone)
    expect(hintOf('Monthly Breakdown')).toBe(monthLabel)
  })

  // The month pager and the five tab pills only ever scoped this section's content; hoisting
  // them above all three is what #1550 came to undo.
  it('should_render_the_month_navigation_inside_monthly_breakdown', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const { monthLabel } = resolveFinancesMonth(undefined, mockBarn.created_at, mockBarn.timezone)
    expect(within(section('Monthly Breakdown')).getAllByText(monthLabel).length).toBeGreaterThan(1)
  })

  it('should_render_the_tab_pills_inside_monthly_breakdown', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const pills = within(section('Monthly Breakdown')).getAllByRole('link', { name: /^By / })
    expect(pills.map((p) => p.textContent)).toEqual(['By Horse', 'By Tier', 'By Rider', 'By Instructor', 'By Paid To'])
  })

  it('should_render_pending_income_inside_monthly_breakdown', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(within(section('Monthly Breakdown')).getByText('Pending income')).toBeDefined()
  })

  // -------------------------------------------------------------------------

  it('should_show_outstanding_section_when_outstanding_lessons_exist', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([OUTSTANDING_LESSON])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Outstanding Income')).toBeDefined()
  })

  // The amber moved off the section wrapper onto the total itself (#1550). It was only ever
  // reaching the label anyway — every cell, link and figure below it sets its own colour.
  it('should_highlight_the_outstanding_income_total_when_it_is_greater_than_zero', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([OUTSTANDING_LESSON])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(totalOf('Outstanding Income').textContent).toContain('$75.00')
    expect(totalOf('Outstanding Income').className).toMatch(/amber/)
  })

  it('should_not_highlight_the_outstanding_income_total_when_it_is_zero', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([{ ...OUTSTANDING_LESSON, fee: 0 }])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(totalOf('Outstanding Income').textContent).toContain('$0.00')
    expect(totalOf('Outstanding Income').className).not.toMatch(/amber/)
  })

  // #1550 — both Outstanding sections explain themselves in a description that leads the
  // section, the same shape Manage Barn's sections use (#1557), rather than behind an ⓘ the
  // reader has to know to tap. The four tests come in pairs: the description is present, and
  // the popover it replaced is gone — the second half is what fails if an ⓘ is reintroduced
  // alongside the prose, leaving the page saying the same thing twice.
  it('should_describe_what_outstanding_income_lists', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([OUTSTANDING_LESSON])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(
      within(section('Outstanding Income')).getByText(
        'All-time unpaid lessons, leases, and boarding charges — not only the month shown below.'
      )
    ).not.toBeNull()
  })

  it('should_not_render_an_info_button_in_the_outstanding_income_section', async () => {
    vi.mocked(getOutstandingLessons).mockResolvedValue([OUTSTANDING_LESSON])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(section('Outstanding Income').querySelector('button[aria-label="Info"]')).toBeNull()
  })

  it('should_describe_why_an_entry_is_in_outstanding_expenses', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([OUTSTANDING_EXPENSE])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(
      within(section('Outstanding Expenses')).getByText(
        'Expenses past their scheduled time that are still missing an amount, a payment type, or both. The total counts only the ones with an amount.'
      )
    ).not.toBeNull()
  })

  it('should_not_render_an_info_button_in_the_outstanding_expenses_section', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([OUTSTANDING_EXPENSE])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(section('Outstanding Expenses').querySelector('button[aria-label="Info"]')).toBeNull()
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

  it('should_collapse_outstanding_income_section_when_only_outstanding_expenses_exist', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([OUTSTANDING_EXPENSE])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(section('Outstanding Income').open).toBe(false)
  })

  it('should_sum_only_known_amounts_in_the_outstanding_expenses_total', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([
      { id: 'expense-1', barn_id: 'barn-1', expense_date: calendarDate('2026-05-01'), expense_time: null, amount: null, recipient: 'Dr. Smith', expense_type: 'Farrier', notes: null, applies_to_all_horses: false, payment_type: null, created_at: '', updated_at: '' },
      { id: 'expense-2', barn_id: 'barn-1', expense_date: calendarDate('2026-05-02'), expense_time: null, amount: 120, recipient: 'Feed Co', expense_type: 'Feed', notes: null, applies_to_all_horses: true, payment_type: null, created_at: '', updated_at: '' },
    ])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(within(section('Outstanding Expenses')).getByText('$120.00')).toBeDefined()
  })

  // #1550 removed this section's ⓘ in favour of the description asserted above; its inverse now
  // lives there as `should_not_render_an_info_button_in_the_outstanding_expenses_section`.

  // Amber on the count, not on the total: an entry with no amount yet still needs attention,
  // and it contributes $0 to the figure. Gated on there being an entry at all, since #1550 the
  // section renders even when there is nothing wrong — an amber $0.00 there would be a lie.
  it('should_style_the_outstanding_expenses_total_amber_even_when_no_amount_is_known', async () => {
    vi.mocked(getOutstandingExpenses).mockResolvedValue([OUTSTANDING_EXPENSE])
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(totalOf('Outstanding Expenses').textContent).toContain('$0.00')
    expect(totalOf('Outstanding Expenses').className).toMatch(/amber/)
  })

  it('should_not_style_the_outstanding_expenses_total_amber_when_nothing_is_outstanding', async () => {
    const jsx = await FinancesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(totalOf('Outstanding Expenses').textContent).toContain('$0.00')
    expect(totalOf('Outstanding Expenses').className).not.toMatch(/amber/)
  })

})
