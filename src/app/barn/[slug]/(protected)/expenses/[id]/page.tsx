import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getExpenseById, getRecentRecipients, getRecentExpenseTypes } from '@/lib/db/expenses'
import { updateExpenseAction } from '@/app/actions/expenses'
import { getScheduleRangeForBarn } from '@/app/actions/lessons'
import { Button } from '@/components/ui/Button'
import { barnToday } from '@/lib/barn-timezone'
import { ExpenseForm } from '../ExpenseForm'
import { AppointmentDetail } from './AppointmentDetail'

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  // #1148: a trainer reads the same record as an *appointment* — no cost, no edit. Opened up
  // from manager-only so the dashboard's appointment card has a real destination for them;
  // /delete and the /expenses list stay manager-only.
  const { barn, membership } = await requireMembership(slug, ['manager', 'trainer'])

  const expense = await getExpenseById(id, barn.id)
  if (!expense) notFound()

  // Returned before the three manager-only form lookups below, which a trainer's view has
  // no field to put to use.
  if (membership.role === 'trainer') return <AppointmentDetail appointment={expense} />

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
  const getScheduleRange = getScheduleRangeForBarn.bind(null, slug)

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
        todayStr={barnToday(barn.timezone)}
        timezone={barn.timezone}
        getScheduleRange={getScheduleRange}
        excludeItemId={expense.id}
        initial={{
          recipient: expense.recipient,
          expenseType: expense.expense_type,
          expenseTime: expense.expense_time,
          amount: expense.amount,
          notes: expense.notes,
          appliesToAllHorses: expense.applies_to_all_horses,
          horseIds: expense.horse_ids,
          paymentType: expense.payment_type,
        }}
        submitLabel="Save Changes"
        onSave={save}
      />
    </main>
  )
}
