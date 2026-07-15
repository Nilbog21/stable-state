'use server'

import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById, deleteExpense, createExpense, updateExpense, getMostCommonTypeForRecipient } from '@/lib/db/expenses'
import type { ExpenseInput, PaymentType } from '@/lib/db/types'
import { parseNonNegativeAmount } from '@/lib/parse-amount'

const PAYMENT_TYPES: PaymentType[] = ['venmo', 'zelle', 'cash', 'check', 'freshbooks']

export async function deleteExpenseAction(
  barnId: string,
  barnSlug: string,
  expenseId: string
): Promise<void> {
  await requireMembership(barnSlug, ['manager'])

  const expense = await getExpenseById(expenseId, barnId)
  if (!expense) {
    redirect(`/barn/${barnSlug}/expenses`)
    return
  }

  await deleteExpense(expenseId, barnId)
  redirect(`/barn/${barnSlug}/expenses`)
}

export type ExpenseFormState = { error: string | null }

function parseExpenseFormData(formData: FormData): { error: string } | { data: ExpenseInput } {
  const recipient = (formData.get('recipient') as string | null)?.trim()
  if (!recipient) return { error: 'recipient required' }

  const expenseDate = (formData.get('expense_date') as string | null)?.trim()
  if (!expenseDate) return { error: 'date required' }

  const amountRaw = formData.get('amount') as string | null
  const amount = parseNonNegativeAmount(amountRaw)
  if (amount === null && (amountRaw ?? '').trim() !== '') {
    return { error: 'a valid, non-negative amount is required' }
  }

  const expenseTypeRaw = (formData.get('expense_type') as string | null)?.trim()
  const expenseType = expenseTypeRaw || 'Unspecified'
  const expenseTime = (formData.get('expense_time') as string | null)?.trim() || null
  const notes = (formData.get('notes') as string | null)?.trim() || null
  const appliesToAllHorses = formData.get('applies_to_all_horses') === 'true'
  const horseIds = appliesToAllHorses ? undefined : (formData.getAll('horse_id') as string[])

  const paymentTypeRaw = (formData.get('payment_type') as string | null)?.trim() || null
  if (paymentTypeRaw !== null && !PAYMENT_TYPES.includes(paymentTypeRaw as PaymentType)) {
    return { error: 'invalid payment type' }
  }
  // ponytail: a payment type only means anything once the amount is known — a still-planned
  // expense (amount blank) can't have collected a payment yet, so drop any stray value here
  // rather than trusting the client to keep the two fields in sync.
  const paymentType = amount === null ? null : (paymentTypeRaw as PaymentType | null)

  return {
    data: {
      expenseDate,
      expenseTime,
      amount,
      recipient,
      expenseType,
      notes,
      appliesToAllHorses,
      horseIds,
      paymentType,
    },
  }
}

export async function createExpenseAction(
  barnSlug: string,
  _prevState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const parsed = parseExpenseFormData(formData)
  if ('error' in parsed) return parsed

  await createExpense(barn.id, parsed.data)

  redirect(`/barn/${barnSlug}/expenses`)
}

export async function updateExpenseAction(
  barnSlug: string,
  expenseId: string,
  _prevState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const parsed = parseExpenseFormData(formData)
  if ('error' in parsed) return parsed

  await updateExpense(expenseId, barn.id, parsed.data)

  redirect(`/barn/${barnSlug}/expenses`)
}

export async function getMostCommonExpenseTypeAction(
  barnSlug: string,
  recipient: string
): Promise<string | null> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const trimmed = recipient.trim()
  if (!trimmed) return null

  return getMostCommonTypeForRecipient(barn.id, trimmed)
}

// Resolves an overdue planned expense (past-due, amount still unknown) from the Finances
// dashboard's Outstanding section — reuses the full-replace updateExpense/update_expense_with_horses
// path (same one the edit form uses) rather than a dedicated RPC, since every other field on
// the row is unchanged.
export async function resolvePastDueExpenseAction(
  barnSlug: string,
  expenseId: string,
  amountRaw: string,
  paymentTypeRaw: string | null
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const amount = parseNonNegativeAmount(amountRaw)
  if (amount === null || amount === 0) {
    return { error: 'a non-zero amount is required' }
  }

  if (paymentTypeRaw !== null && !PAYMENT_TYPES.includes(paymentTypeRaw as PaymentType)) {
    return { error: 'invalid payment type' }
  }

  const expense = await getExpenseById(expenseId, barn.id)
  if (!expense) return { error: 'expense not found' }

  try {
    await updateExpense(expenseId, barn.id, {
      expenseDate: expense.expense_date,
      expenseTime: expense.expense_time,
      amount,
      recipient: expense.recipient,
      expenseType: expense.expense_type,
      notes: expense.notes,
      appliesToAllHorses: expense.applies_to_all_horses,
      horseIds: expense.horse_ids,
      paymentType: paymentTypeRaw as PaymentType | null,
    })
  } catch {
    return { error: 'Failed to resolve expense' }
  }

  return { error: null }
}
