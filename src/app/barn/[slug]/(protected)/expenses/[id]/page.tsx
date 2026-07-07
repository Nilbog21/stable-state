import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getExpenseById, getRecentRecipients, getRecentExpenseTypes } from '@/lib/db/expenses'
import { updateExpenseAction } from '@/app/actions/expenses'
import { Button } from '@/components/ui/Button'
import { ExpenseForm } from '../ExpenseForm'

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const expense = await getExpenseById(id, barn.id)
  if (!expense) notFound()

  const [horses, recentRecipients, recentExpenseTypes] = await Promise.all([
    getHorsesByBarn(barn.id),
    getRecentRecipients(barn.id),
    getRecentExpenseTypes(barn.id),
  ])

  const activeHorseIds = new Set(horses.map((h) => h.id))
  const inactiveAssigned = expense.horse_ids
    .map((horseId, i) => ({ id: horseId, name: expense.horse_names[i] }))
    .filter((h) => !activeHorseIds.has(h.id))
    .map((h) => ({ id: h.id, name: `${h.name} (inactive)` }))
  const horsesForForm = [...horses, ...inactiveAssigned]

  const save = updateExpenseAction.bind(null, slug, expense.id)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit Expense
        </h1>
        <Button href={`/barn/${slug}/expenses/${expense.id}/delete`} variant="danger">Delete</Button>
      </div>
      <ExpenseForm
        barnSlug={slug}
        horses={horsesForForm}
        recentRecipients={recentRecipients}
        recentExpenseTypes={recentExpenseTypes}
        defaultDate={expense.expense_date}
        initial={{
          recipient: expense.recipient,
          expenseType: expense.expense_type,
          expenseTime: expense.expense_time,
          amount: expense.amount,
          notes: expense.notes,
          appliesToAllHorses: expense.applies_to_all_horses,
          horseIds: expense.horse_ids,
        }}
        submitLabel="Save Changes"
        onSave={save}
      />
    </main>
  )
}
