import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({ getExpenseById: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/expenses', () => ({ deleteExpenseAction: vi.fn() }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getExpenseById } from '@/lib/db/expenses'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { notFound } from 'next/navigation'
import DeleteExpensePage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }

const mockManagerMembership = {
  id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1',
  role: 'manager' as const, status: 'active' as const, created_at: '',
}

const mockExpense = {
  id: 'expense-1',
  barn_id: 'barn-1',
  expense_date: '2026-07-01',
  expense_time: null,
  amount: 100,
  recipient: 'Dr. Smith',
  expense_type: 'Veterinary',
  notes: null,
  applies_to_all_horses: false,
  created_at: '',
  updated_at: '',
  horse_ids: ['horse-1'],
  horse_names: ['Thunderbolt'],
}

function setupDefaults() {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1' } as any)
  vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
  vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
  vi.mocked(getExpenseById).mockResolvedValue(mockExpense)
}

const params = Promise.resolve({ slug: 'green-acres', id: 'expense-1' })

describe('DeleteExpensePage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockReset()
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getExpenseById).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getAuthenticatedUser).mockReset()
    setupDefaults()
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(DeleteExpensePage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_user_not_authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(DeleteExpensePage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_missing', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(DeleteExpensePage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_membership_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, status: 'pending' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(DeleteExpensePage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_role_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'trainer' as const })
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(DeleteExpensePage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_when_expense_not_found', async () => {
    vi.mocked(getExpenseById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(DeleteExpensePage({ params })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_recipient_summary', async () => {
    const jsx = await DeleteExpensePage({ params })
    render(jsx)
    expect(screen.getByText(/Dr\. Smith/)).toBeDefined()
  })

  it('should_render_confirm_delete_button', async () => {
    const jsx = await DeleteExpensePage({ params })
    render(jsx)
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeDefined()
  })
})
