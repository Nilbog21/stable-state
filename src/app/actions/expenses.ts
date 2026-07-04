'use server'

import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById, deleteExpense } from '@/lib/db/expenses'

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
