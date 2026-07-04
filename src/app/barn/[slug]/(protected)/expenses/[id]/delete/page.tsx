import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getExpenseById } from '@/lib/db/expenses'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { deleteExpenseAction } from '@/app/actions/expenses'
import { Button } from '@/components/ui/Button'
import { formatExpenseDate, formatExpenseAmount } from '../../ExpenseRow'

export default async function DeleteExpensePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) notFound()

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active' || membership.role !== 'manager') notFound()

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
