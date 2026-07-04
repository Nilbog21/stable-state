import { requireMembership } from '@/lib/auth/guard'
import { getExpensesByBarn } from '@/lib/db/expenses'
import { Button } from '@/components/ui/Button'
import { Th } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'
import { ExpenseRow } from './ExpenseRow'
import { OlderExpensesToggle } from './OlderExpensesToggle'

const OLDER_EXPENSE_CUTOFF_DAYS = 7

export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const expenses = await getExpensesByBarn(barn.id)

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - OLDER_EXPENSE_CUTOFF_DAYS)
  const recentExpenses = expenses.filter((e) => new Date(`${e.expense_date}T00:00:00Z`) >= cutoff)
  const olderExpenses = expenses.filter((e) => new Date(`${e.expense_date}T00:00:00Z`) < cutoff)

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Expenses
        </h1>
        <Button href={`/barn/${slug}/expenses/new`}>Add Expense</Button>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          heading="No expenses yet"
          subtext="Expenses you record will appear here."
          cta={{ label: 'Add Expense', href: `/barn/${slug}/expenses/new` }}
        />
      ) : (
        <>
          {recentExpenses.length > 0 && (
            <div className="w-full max-w-2xl overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th scope="col">Date</Th>
                    <Th scope="col">Time</Th>
                    <Th scope="col">Recipient</Th>
                    <Th scope="col">Type</Th>
                    <Th scope="col">Horse(s)</Th>
                    <Th scope="col">Amount</Th>
                    <Th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {recentExpenses.map((expense) => (
                    <ExpenseRow key={expense.id} expense={expense} slug={slug} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <OlderExpensesToggle expenses={olderExpenses} slug={slug} />
        </>
      )}
    </main>
  )
}
