import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse, createMockUser, createMockExpenseWithHorses } from '@/test/fixtures'

afterEach(cleanup)

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorsesByBarn: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({
  getExpenseById: vi.fn(),
  getRecentRecipients: vi.fn(),
  getRecentExpenseTypes: vi.fn(),
  updateExpense: vi.fn(),
  getMostCommonTypeForRecipient: vi.fn(),
}))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))

import { requireMembership } from '@/lib/auth/guard'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getExpenseById, getRecentRecipients, getRecentExpenseTypes } from '@/lib/db/expenses'
import { notFound } from 'next/navigation'
import EditExpensePage from '../page'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const mockManagerMembership = createMockMembership({ role: 'manager' })
const mockExpense = createMockExpenseWithHorses({
  id: 'expense-1',
  recipient: 'Dr. Smith',
  horse_ids: ['horse-2'],
  horse_names: ['Butter'],
})

function callPage() {
  return EditExpensePage({ params: Promise.resolve({ slug: 'green-acres', id: 'expense-1' }) })
}

describe('EditExpensePage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getExpenseById).mockReset()
    vi.mocked(getRecentRecipients).mockReset()
    vi.mocked(getRecentExpenseTypes).mockReset()
    vi.mocked(notFound).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'horse-1', name: 'Apple' }),
      createMockHorse({ id: 'horse-2', name: 'Butter' }),
    ])
    vi.mocked(getExpenseById).mockResolvedValue(mockExpense)
    vi.mocked(getRecentRecipients).mockResolvedValue(['Dr. Hoof Farrier'])
    vi.mocked(getRecentExpenseTypes).mockResolvedValue(['Farrier'])
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await callPage()
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_notFound_when_expense_not_found', async () => {
    vi.mocked(getExpenseById).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => { throw new Error('NEXT_NOT_FOUND') })
    await expect(callPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_render_edit_expense_heading', async () => {
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('heading', { name: /edit expense/i })).toBeDefined()
  })

  it('should_prefill_recipient_from_the_expense', async () => {
    const jsx = await callPage()
    render(jsx)
    expect((screen.getByLabelText(/recipient/i) as HTMLInputElement).value).toBe('Dr. Smith')
  })

  it('should_check_the_horse_already_assigned_to_the_expense', async () => {
    const jsx = await callPage()
    render(jsx)
    expect((screen.getByRole('checkbox', { name: 'Butter' }) as HTMLInputElement).checked).toBe(true)
  })

  it('should_render_save_changes_submit_button', async () => {
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDefined()
  })

  it('should_render_delete_link_to_the_delete_confirmation_page', async () => {
    const jsx = await callPage()
    render(jsx)
    const link = screen.getByRole('link', { name: /delete/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/expenses\/expense-1\/delete$/)
  })
})
