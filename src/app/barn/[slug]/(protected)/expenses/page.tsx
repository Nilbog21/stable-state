import { requireMembership } from '@/lib/auth/guard'
import { getExpensesByBarn } from '@/lib/db/expenses'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/EmptyState'
import { ExpenseCard } from './ExpenseCard'
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

  // getTime/setTime rather than getDate/setDate: a day offset on a real instant is
  // zone-free, and reading the calendar field would resolve it in the host's zone (#1222).
  // Minted once here and threaded down: the Past Due badge compares against the *barn's* wall
  // clock (#1481), and the only other place that could compute it is a client component, where
  // it would resolve in the viewer's zone instead.
  const nowWall = instantToLocalWallClock(new Date(), barn.timezone)

  const cutoff = new Date()
  cutoff.setTime(cutoff.getTime() - OLDER_EXPENSE_CUTOFF_DAYS * 24 * 60 * 60 * 1000)
  const recentExpenses = expenses.filter((e) => new Date(`${e.expense_date}T00:00:00Z`) >= cutoff)
  const olderExpenses = expenses.filter((e) => new Date(`${e.expense_date}T00:00:00Z`) < cutoff)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
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
            <div className="mt-6 flex flex-col gap-2">
              {recentExpenses.map((expense) => (
                <ExpenseCard key={expense.id} expense={expense} slug={slug} nowWall={nowWall} />
              ))}
            </div>
          )}
          <OlderExpensesToggle expenses={olderExpenses} slug={slug} nowWall={nowWall} />
        </>
      )}
    </main>
  )
}
