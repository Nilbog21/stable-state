import { requireMembership } from '@/lib/auth/guard'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRecentRecipients, getRecentExpenseTypes } from '@/lib/db/expenses'
import { createExpenseAction } from '@/app/actions/expenses'
import { getScheduleRangeForBarn } from '@/app/actions/lessons'
import { barnToday } from '@/lib/barn-timezone'
import { ExpenseForm } from '../ExpenseForm'

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const [horses, recentRecipients, recentExpenseTypes] = await Promise.all([
    getHorsesByBarn(barn.id),
    getRecentRecipients(barn.id),
    getRecentExpenseTypes(barn.id),
  ])

  const save = createExpenseAction.bind(null, slug)
  const getScheduleRange = getScheduleRangeForBarn.bind(null, slug)

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Add Expense
      </h1>
      <ExpenseForm
        barnSlug={slug}
        horses={horses}
        recentRecipients={recentRecipients}
        recentExpenseTypes={recentExpenseTypes}
        todayStr={barnToday(barn.timezone)}
        getScheduleRange={getScheduleRange}
        onSave={save}
      />
    </main>
  )
}
