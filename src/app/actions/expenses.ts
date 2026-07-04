'use server'

import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById, deleteExpense, createExpense, getMostCommonTypeForRecipient } from '@/lib/db/expenses'

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

function parseAmount(raw: string | null): number | null {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return null
  const n = parseFloat(trimmed)
  return isNaN(n) || n < 0 ? NaN : n
}

export async function createExpenseAction(
  barnSlug: string,
  _prevState: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const recipient = (formData.get('recipient') as string | null)?.trim()
  if (!recipient) return { error: 'recipient required' }

  const expenseDate = (formData.get('expense_date') as string | null)?.trim()
  if (!expenseDate) return { error: 'date required' }

  const amount = parseAmount(formData.get('amount') as string | null)
  if (Number.isNaN(amount)) return { error: 'a valid, non-negative amount is required' }

  const expenseTypeRaw = (formData.get('expense_type') as string | null)?.trim()
  const expenseType = expenseTypeRaw || 'Unspecified'
  const expenseTime = (formData.get('expense_time') as string | null)?.trim() || null
  const notes = (formData.get('notes') as string | null)?.trim() || null
  const appliesToAllHorses = formData.get('applies_to_all_horses') === 'true'
  const horseIds = appliesToAllHorses ? undefined : (formData.getAll('horse_id') as string[])

  await createExpense(barn.id, {
    expenseDate,
    expenseTime,
    amount,
    recipient,
    expenseType,
    notes,
    appliesToAllHorses,
    horseIds,
  })

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
