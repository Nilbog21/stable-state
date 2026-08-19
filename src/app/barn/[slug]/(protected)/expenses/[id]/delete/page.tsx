import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById } from '@/lib/db/expenses'
import { deleteExpenseAction } from '@/app/actions/expenses'
import { Button } from '@/components/ui/Button'
import { formatExpenseDate, formatExpenseAmount } from '@/lib/format-expense'
import { GuardedForm } from '../../../NavigationBlocker'

export default async function DeleteExpensePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const expense = await getExpenseById(id, barn.id)
  if (!expense) notFound()

  const deleteExpense = deleteExpenseAction.bind(null, barn.id, slug, expense.id)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Delete Expense
      </h1>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        This will permanently delete the {formatExpenseDate(expense.expense_date)} expense to{' '}
        {expense.recipient} ({formatExpenseAmount(expense.amount)}). This cannot be undone.
      </p>
      <GuardedForm action={deleteExpense}>
        {expense.amount !== null && (
          <label className="mb-6 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" name="alsoDeleteTransactions" className="mt-1" />
            Also delete the collected record from Finances
          </label>
        )}
        <Button type="submit" variant="danger">Confirm Delete</Button>
      </GuardedForm>
    </main>
  )
}
