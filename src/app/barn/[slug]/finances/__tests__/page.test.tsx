import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getAdminMembership: vi.fn(),
}))
vi.mock('@/lib/db/lessons', () => ({ getFinancialSummary: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import { getFinancialSummary } from '@/lib/db/lessons'
import FinancesPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const adminMembership = createMockMembership({ id: 'mem-adm', barn_id: null, role: 'admin' })
const trainerMembership = createMockMembership({ id: 'mem-trn', role: 'trainer' })

describe('FinancesPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
    vi.mocked(getFinancialSummary).mockResolvedValue({ totalIncome: 0, breakdown: [] })
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
    vi.mocked(getAdminMembership).mockResolvedValue(null)
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

  it('should_render_page_for_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
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
})
