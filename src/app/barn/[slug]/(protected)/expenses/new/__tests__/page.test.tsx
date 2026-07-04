import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockHorse, createMockUser } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({ requireMembership: vi.fn() }))
vi.mock('@/lib/db/horses', () => ({ getHorsesByBarn: vi.fn() }))
vi.mock('@/lib/db/expenses', () => ({
  getRecentRecipients: vi.fn(),
  getRecentExpenseTypes: vi.fn(),
  createExpense: vi.fn(),
  getMostCommonTypeForRecipient: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRecentRecipients, getRecentExpenseTypes } from '@/lib/db/expenses'
import NewExpensePage from '../page'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const mockManagerMembership = createMockMembership({ role: 'manager' })

function callPage() {
  return NewExpensePage({ params: Promise.resolve({ slug: 'green-acres' }) })
}

describe('NewExpensePage', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getRecentRecipients).mockReset()
    vi.mocked(getRecentExpenseTypes).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse()])
    vi.mocked(getRecentRecipients).mockResolvedValue(['Dr. Hoof Farrier'])
    vi.mocked(getRecentExpenseTypes).mockResolvedValue(['Farrier'])
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await callPage()
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_render_add_expense_heading', async () => {
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('heading', { name: /add expense/i })).toBeDefined()
  })

  it('should_call_getHorsesByBarn_with_barn_id', async () => {
    await callPage()
    expect(getHorsesByBarn).toHaveBeenCalledWith(mockBarn.id)
  })

  it('should_call_getRecentRecipients_with_barn_id', async () => {
    await callPage()
    expect(getRecentRecipients).toHaveBeenCalledWith(mockBarn.id)
  })

  it('should_call_getRecentExpenseTypes_with_barn_id', async () => {
    await callPage()
    expect(getRecentExpenseTypes).toHaveBeenCalledWith(mockBarn.id)
  })

  it('should_render_a_checkbox_for_each_active_horse', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([createMockHorse({ id: 'horse-1', name: 'Apple' })])
    const jsx = await callPage()
    render(jsx)
    expect(screen.getByRole('checkbox', { name: 'Apple' })).toBeDefined()
  })

  it('should_pass_recentRecipients_into_the_rendered_datalist', async () => {
    const jsx = await callPage()
    const { container } = render(jsx)
    const options = Array.from(container.querySelectorAll('datalist#recipient-options option')).map(
      (o) => (o as HTMLOptionElement).value
    )
    expect(options).toEqual(['Dr. Hoof Farrier'])
  })
})
