import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({ getExpenseById: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/expenses', () => ({ deleteExpenseAction: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById } from '@/lib/db/expenses'
import { notFound } from 'next/navigation'
import DeleteExpensePage from '../page'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

const mockBarn = createMockBarn({ id: 'barn-1', name: 'Green Acres', slug: 'green-acres', instructor_cut: 25, created_at: '' })

const mockManagerMembership = createMockMembership({
  id: 'mem-1', user_id: 'user-1', barn_id: 'barn-1',
  role: 'manager' as const, status: 'active' as const, created_at: '',
})

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
  vi.mocked(requireMembership).mockResolvedValue({
    user: { id: 'user-1' } as any,
    barn: mockBarn,
    membership: mockManagerMembership,
  })
  vi.mocked(getExpenseById).mockResolvedValue(mockExpense)
}

const params = Promise.resolve({ slug: 'green-acres', id: 'expense-1' })

describe('DeleteExpensePage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockReset()
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getExpenseById).mockReset()
    setupDefaults()
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await DeleteExpensePage({ params })
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
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
