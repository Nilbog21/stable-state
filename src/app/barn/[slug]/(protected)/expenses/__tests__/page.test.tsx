import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockExpenseWithHorses } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({ getExpensesByBarn: vi.fn() }))
vi.mock('../OlderExpensesToggle', () => ({ OlderExpensesToggle: () => null }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getExpensesByBarn } from '@/lib/db/expenses'
import ExpensesPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', role: 'rider' })

function dateOffsetDays(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

describe('ExpensesPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getExpensesByBarn).mockResolvedValue([])
  })

  afterEach(cleanup)

  it('should_throw_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(ExpensesPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    try { await ExpensesPage({ params: Promise.resolve({ slug: 'unknown' }) }) } catch {}
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    try { await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    try { await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    try { await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    try { await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_heading_for_manager', async () => {
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: 'Expenses' })).toBeDefined()
  })

  it('should_render_add_expense_button_href', async () => {
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const links = screen.getAllByRole('link', { name: 'Add Expense' })
    expect((links[0] as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/expenses\/new$/)
  })

  it('should_show_empty_state_when_no_expenses', async () => {
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no expenses/i)).toBeDefined()
  })

  it('should_show_recent_expense_by_default', async () => {
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: dateOffsetDays(3), recipient: 'Recent Vet' }),
    ])
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Recent Vet')).toBeDefined()
  })

  it('should_not_show_older_expense_by_default', async () => {
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: dateOffsetDays(10), recipient: 'Old Vet' }),
    ])
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Old Vet')).toBeNull()
  })

  it('should_not_render_table_when_all_expenses_are_older_than_cutoff', async () => {
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: dateOffsetDays(10) }),
    ])
    const jsx = await ExpensesPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('table')).toBeNull()
  })
})
