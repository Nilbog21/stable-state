import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getExpenseById } from '@/lib/db/expenses'
import { deleteExpenseAction } from '@/app/actions/expenses'
import { Button } from '@/components/ui/Button'
import { formatExpenseDate, formatExpenseAmount } from '../../ExpenseRow'

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
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Delete Expense
        </h1>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          This will permanently delete the {formatExpenseDate(expense.expense_date)} expense to{' '}
          {expense.recipient} ({formatExpenseAmount(expense.amount)}). This cannot be undone.
        </p>
        <form action={deleteExpense}>
          <Button type="submit" variant="danger">Confirm Delete</Button>
        </form>
      </div>
    </main>
  )
}
