'use server'

/**
 * Expense Server Actions, all manager-only via `requireMembership`: create/update
 * (`createExpenseAction`/`updateExpenseAction`, sharing the private
 * `parseExpenseFormData` — the parse-then-dispatch shape `lesson-form-parsing.ts`
 * mirrors; a blank amount keeps the expense "planned" and deliberately drops any stray
 * payment type), delete (`deleteExpenseAction`, forwarding the
 * also-delete-collected-transactions checkbox to `deleteExpense`), and the
 * `getMostCommonExpenseTypeAction` lookup that pre-fills the expense form's type field
 * from the recipient's history.
 */
import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById, deleteExpense, createExpense, updateExpense, getMostCommonTypeForRecipient } from '@/lib/db/expenses'
import type { ExpenseInput, PaymentType } from '@/lib/db/types'
import { parseNonNegativeAmount } from '@/lib/parse-amount'

const PAYMENT_TYPES: PaymentType[] = ['venmo', 'zelle', 'cash', 'check', 'freshbooks']

export async function deleteExpenseAction(
  barnId: string,
  barnSlug: string,
  expenseId: string,
  formData: FormData
): Promise<void> {
  await requireMembership(barnSlug, ['manager'])

  const expense = await getExpenseById(expenseId, barnId)
  if (!expense) {
    redirect(`/barn/${barnSlug}/expenses`)
    return
  }

  const deleteCollectedTransactions = formData.get('alsoDeleteTransactions') === 'on'
  await deleteExpense(expenseId, barnId, deleteCollectedTransactions)
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
  const showsOnCalendar = formData.get('shows_on_calendar') === 'true'
  const horseIds = appliesToAllHorses ? undefined : (formData.getAll('horse_id') as string[])

  const paymentTypeRaw = (formData.get('payment_type') as string | null)?.trim() || null
  if (paymentTypeRaw !== null && !PAYMENT_TYPES.includes(paymentTypeRaw as PaymentType)) {
    return { error: 'invalid payment type' }
  }
  // ponytail: a payment type only means anything once the amount is known — a still-planned
  // expense (amount blank) can't have collected a payment yet, so drop any stray value here
  // rather than trusting the client to keep the two fields in sync.
  const paymentType = amount === null ? null : (paymentTypeRaw as PaymentType | null)

  const occurredAt = (formData.get('occurred_at') as string | null)?.trim() || undefined

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
      occurredAt,
      showsOnCalendar,
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
