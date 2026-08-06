import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { withBlocker } from '@/test/navigation-blocker-harness'

afterEach(cleanup)

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({ getExpenseById: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/app/actions/expenses', () => ({ deleteExpenseAction: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById } from '@/lib/db/expenses'
import DeleteExpensePage from '../page'
import { createMockBarn, createMockExpenseWithHorses, createMockMembership } from '@/test/fixtures'

const params = Promise.resolve({ slug: 'green-acres', id: 'expense-1' })

describe('DeleteExpensePage — navigation dirty state', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as never,
      barn: createMockBarn({ id: 'barn-1', slug: 'green-acres' }),
      membership: createMockMembership({ id: 'mem-1', barn_id: 'barn-1', role: 'manager' }),
    })
    vi.mocked(getExpenseById).mockResolvedValue(createMockExpenseWithHorses({ id: 'expense-1', amount: 100 }))
  })

  it('should_set_dirty_when_also_delete_transactions_checkbox_toggled', async () => {
    const jsx = await DeleteExpensePage({ params })
    render(withBlocker(jsx))
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
