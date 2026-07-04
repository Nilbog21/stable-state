import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockExpenseWithHorses } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/expenses', () => ({
  getExpenseById: vi.fn(),
  deleteExpense: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById, deleteExpense } from '@/lib/db/expenses'
import { redirect } from 'next/navigation'
import { deleteExpenseAction } from '../expenses'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager' })
const mockExpense = createMockExpenseWithHorses()

function guardAs(membership: ReturnType<typeof createMockMembership>) {
  vi.mocked(requireMembership).mockResolvedValue({
    user: { id: 'user-1' } as any,
    barn: mockBarn,
    membership,
  })
}

describe('deleteExpenseAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getExpenseById).mockReset()
    vi.mocked(deleteExpense).mockReset()
    vi.mocked(redirect).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(getExpenseById).mockResolvedValue(mockExpense)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await deleteExpenseAction('barn-1', 'barn-slug', 'expense-1')
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager'])
  })

  it('should_redirect_to_list_when_expense_not_found', async () => {
    vi.mocked(getExpenseById).mockResolvedValue(null)
    await deleteExpenseAction('barn-1', 'barn-slug', 'expense-1')
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/expenses')
  })

  it('should_not_call_deleteExpense_when_expense_not_found', async () => {
    vi.mocked(getExpenseById).mockResolvedValue(null)
    await deleteExpenseAction('barn-1', 'barn-slug', 'expense-1')
    expect(deleteExpense).not.toHaveBeenCalled()
  })

  it('should_call_deleteExpense_with_correct_args', async () => {
    await deleteExpenseAction('barn-1', 'barn-slug', 'expense-1')
    expect(deleteExpense).toHaveBeenCalledWith('expense-1', 'barn-1')
  })

  it('should_redirect_to_list_after_delete', async () => {
    await deleteExpenseAction('barn-1', 'barn-slug', 'expense-1')
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/expenses')
  })
})
