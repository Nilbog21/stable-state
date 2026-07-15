import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockExpenseWithHorses } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/expenses', () => ({
  getExpenseById: vi.fn(),
  deleteExpense: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  getMostCommonTypeForRecipient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById, deleteExpense, createExpense, updateExpense, getMostCommonTypeForRecipient } from '@/lib/db/expenses'
import { redirect } from 'next/navigation'
import { deleteExpenseAction, createExpenseAction, updateExpenseAction, getMostCommonExpenseTypeAction } from '../expenses'
import { createMockHorseExpense } from '@/test/fixtures'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager' })
const mockExpense = createMockExpenseWithHorses()

function makeFormData(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      for (const item of v) fd.append(k, item)
    } else {
      fd.append(k, v)
    }
  }
  return fd
}

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

describe('createExpenseAction', () => {
  const noError = { error: null }
  const baseFields = {
    recipient: 'Dr. Hoof Farrier',
    expense_date: '2026-07-10',
  }

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(createExpense).mockReset()
    vi.mocked(redirect).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(createExpense).mockResolvedValue(createMockHorseExpense())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData(baseFields))
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager'])
  })

  it('should_return_error_when_recipient_is_blank', async () => {
    const result = await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, recipient: '' }))
    expect(result.error).toBe('recipient required')
  })

  it('should_not_call_createExpense_when_recipient_is_blank', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, recipient: '' }))
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('should_trim_whitespace_from_recipient', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, recipient: '  Dr. Hoof Farrier  ' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ recipient: 'Dr. Hoof Farrier' }))
  })

  it('should_return_error_when_date_is_blank', async () => {
    const result = await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, expense_date: '' }))
    expect(result.error).toBe('date required')
  })

  it('should_not_call_createExpense_when_date_is_blank', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, expense_date: '' }))
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('should_normalize_whitespace_only_expense_type_to_unspecified', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, expense_type: '   ' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ expenseType: 'Unspecified' }))
  })

  it('should_pass_through_provided_expense_type_unchanged', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, expense_type: 'Farrier' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ expenseType: 'Farrier' }))
  })

  it('should_default_blank_amount_to_null', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, amount: '' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ amount: null }))
  })

  it('should_parse_valid_amount_as_a_number', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, amount: '125.50' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ amount: 125.5 }))
  })

  it('should_return_error_when_amount_is_negative', async () => {
    const result = await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, amount: '-5' }))
    expect(result.error).toBe('a valid, non-negative amount is required')
  })

  it('should_return_error_when_amount_is_non_numeric', async () => {
    const result = await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, amount: 'abc' }))
    expect(result.error).toBe('a valid, non-negative amount is required')
  })

  it('should_not_call_createExpense_when_amount_is_invalid', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, amount: 'abc' }))
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('should_pass_null_expense_time_when_blank', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, expense_time: '' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ expenseTime: null }))
  })

  it('should_pass_provided_expense_time', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, expense_time: '09:00' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ expenseTime: '09:00' }))
  })

  it('should_pass_null_notes_when_blank', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, notes: '' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ notes: null }))
  })

  it('should_pass_provided_notes', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, notes: 'Regular trim' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ notes: 'Regular trim' }))
  })

  it('should_set_appliesToAllHorses_true_and_omit_horseIds_when_entire_barn_checked', async () => {
    await createExpenseAction(
      'barn-slug',
      noError,
      makeFormData({ ...baseFields, applies_to_all_horses: 'true', horse_id: ['horse-1'] })
    )
    expect(createExpense).toHaveBeenCalledWith(
      'barn-1',
      expect.objectContaining({ appliesToAllHorses: true, horseIds: undefined })
    )
  })

  it('should_collect_horseIds_from_checked_checkboxes_when_not_entire_barn', async () => {
    await createExpenseAction(
      'barn-slug',
      noError,
      makeFormData({ ...baseFields, horse_id: ['horse-1', 'horse-2'] })
    )
    expect(createExpense).toHaveBeenCalledWith(
      'barn-1',
      expect.objectContaining({ appliesToAllHorses: false, horseIds: ['horse-1', 'horse-2'] })
    )
  })

  it('should_redirect_to_expenses_list_after_create', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData(baseFields))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/expenses')
  })

  it('should_default_blank_payment_type_to_null', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, payment_type: '' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ paymentType: null }))
  })

  it('should_pass_through_valid_payment_type', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, amount: '50', payment_type: 'venmo' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ paymentType: 'venmo' }))
  })

  it('should_return_error_when_payment_type_is_invalid', async () => {
    const result = await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, payment_type: 'bitcoin' }))
    expect(result.error).toBe('invalid payment type')
  })

  it('should_not_call_createExpense_when_payment_type_is_invalid', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, payment_type: 'bitcoin' }))
    expect(createExpense).not.toHaveBeenCalled()
  })

  it('should_null_out_payment_type_when_amount_is_blank', async () => {
    await createExpenseAction('barn-slug', noError, makeFormData({ ...baseFields, payment_type: 'venmo' }))
    expect(createExpense).toHaveBeenCalledWith('barn-1', expect.objectContaining({ paymentType: null }))
  })
})

describe('updateExpenseAction', () => {
  const noError = { error: null }
  const baseFields = {
    recipient: 'Dr. Hoof Farrier',
    expense_date: '2026-07-10',
  }

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateExpense).mockReset()
    vi.mocked(redirect).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(updateExpense).mockResolvedValue(createMockHorseExpense())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData(baseFields))
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager'])
  })

  it('should_return_error_when_recipient_is_blank', async () => {
    const result = await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData({ ...baseFields, recipient: '' }))
    expect(result.error).toBe('recipient required')
  })

  it('should_not_call_updateExpense_when_recipient_is_blank', async () => {
    await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData({ ...baseFields, recipient: '' }))
    expect(updateExpense).not.toHaveBeenCalled()
  })

  it('should_return_error_when_date_is_blank', async () => {
    const result = await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData({ ...baseFields, expense_date: '' }))
    expect(result.error).toBe('date required')
  })

  it('should_return_error_when_amount_is_negative', async () => {
    const result = await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData({ ...baseFields, amount: '-5' }))
    expect(result.error).toBe('a valid, non-negative amount is required')
  })

  it('should_call_updateExpense_with_expenseId_barnId_and_parsed_data', async () => {
    await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData({ ...baseFields, amount: '125.50' }))
    expect(updateExpense).toHaveBeenCalledWith('expense-1', 'barn-1', expect.objectContaining({ recipient: 'Dr. Hoof Farrier', amount: 125.5 }))
  })

  it('should_set_appliesToAllHorses_true_and_omit_horseIds_when_entire_barn_checked', async () => {
    await updateExpenseAction(
      'barn-slug',
      'expense-1',
      noError,
      makeFormData({ ...baseFields, applies_to_all_horses: 'true', horse_id: ['horse-1'] })
    )
    expect(updateExpense).toHaveBeenCalledWith(
      'expense-1',
      'barn-1',
      expect.objectContaining({ appliesToAllHorses: true, horseIds: undefined })
    )
  })

  it('should_redirect_to_expenses_list_after_update', async () => {
    await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData(baseFields))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/expenses')
  })

  it('should_pass_through_valid_payment_type', async () => {
    await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData({ ...baseFields, amount: '50', payment_type: 'check' }))
    expect(updateExpense).toHaveBeenCalledWith('expense-1', 'barn-1', expect.objectContaining({ paymentType: 'check' }))
  })

  it('should_null_out_payment_type_when_amount_is_blank', async () => {
    await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData({ ...baseFields, payment_type: 'check' }))
    expect(updateExpense).toHaveBeenCalledWith('expense-1', 'barn-1', expect.objectContaining({ paymentType: null }))
  })

  it('should_return_error_when_payment_type_is_invalid', async () => {
    const result = await updateExpenseAction('barn-slug', 'expense-1', noError, makeFormData({ ...baseFields, payment_type: 'bitcoin' }))
    expect(result.error).toBe('invalid payment type')
  })
})

describe('getMostCommonExpenseTypeAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMostCommonTypeForRecipient).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(getMostCommonTypeForRecipient).mockResolvedValue('Farrier')
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await getMostCommonExpenseTypeAction('barn-slug', 'Dr. Hoof Farrier')
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager'])
  })

  it('should_return_null_when_recipient_is_blank', async () => {
    const result = await getMostCommonExpenseTypeAction('barn-slug', '   ')
    expect(result).toBeNull()
  })

  it('should_not_call_getMostCommonTypeForRecipient_when_recipient_is_blank', async () => {
    await getMostCommonExpenseTypeAction('barn-slug', '   ')
    expect(getMostCommonTypeForRecipient).not.toHaveBeenCalled()
  })

  it('should_call_getMostCommonTypeForRecipient_with_trimmed_recipient_and_barn_id', async () => {
    await getMostCommonExpenseTypeAction('barn-slug', '  Dr. Hoof Farrier  ')
    expect(getMostCommonTypeForRecipient).toHaveBeenCalledWith('barn-1', 'Dr. Hoof Farrier')
  })

  it('should_return_null_when_no_history_for_recipient', async () => {
    vi.mocked(getMostCommonTypeForRecipient).mockResolvedValue(null)
    const result = await getMostCommonExpenseTypeAction('barn-slug', 'New Vendor')
    expect(result).toBeNull()
  })

  it('should_return_the_most_common_type_when_history_exists', async () => {
    const result = await getMostCommonExpenseTypeAction('barn-slug', 'Dr. Hoof Farrier')
    expect(result).toBe('Farrier')
  })
})
