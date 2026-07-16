import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary, computeHorseNetIncome, NON_LESSON_INCOME_LABEL, NO_INSTRUCTOR_LABEL, NO_HORSE_LABEL, NO_RIDER_LABEL } from '@/lib/db/lesson-finances'
import { getOutstandingLessons, getOutstandingCancellationFees, mergeOutstandingItems } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreement-finances'
import { getOutstandingExpenses } from '@/lib/db/expenses'
import { getExpenseFinancialSummary, getRecipientExpenseSummary } from '@/lib/db/expense-finances'
import { resolveFinancesMonth, formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import { formatShortDateOnly } from '@/lib/format-date'
import { buildReconciliationColumn, deriveNetColumn } from '@/lib/finances-reconciliation'
import { OutstandingTable } from './OutstandingTable'
import { InfoPopover } from './InfoPopover'
import { ByTierTable } from './ByTierTable'
import { ByHorseTable } from './ByHorseTable'
import { ByRiderTable } from './ByRiderTable'
import { ByInstructorTable } from './ByInstructorTable'
import { ByPaidToTable } from './ByPaidToTable'
import { Pill } from '@/components/ui/Pill'
import { EmptyState } from '@/components/EmptyState'

const VALID_TABS = ['horse', 'tier', 'rider', 'trainer', 'recipient'] as const
type Tab = typeof VALID_TABS[number]

export default async function FinancesPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ month?: string; tab?: string }>
}) {
  const { slug } = await params
  const { barn } = await requireMembership(slug, ['manager'])

  const { month: monthQueryParam, tab: tabParam } = await searchParams
  const tab: Tab = VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'horse'

  const { startDate, endDate, monthLabel, isCurrentMonth, prevMonthUrl, nextMonthUrl } =
    resolveFinancesMonth(monthQueryParam, barn.created_at, new Date())

  const [{ pendingIncome, breakdown }, horseIncome, riderIncome, trainerIncome, outstandingLessons, outstandingCharges, outstandingCancellationFees, expenseSummary, outstandingExpenses, recipientExpenses] = await Promise.all([
    getFinancialSummary(barn.id, startDate, endDate),
    getHorseIncomeSummary(barn.id, startDate, endDate),
    getRiderIncomeSummary(barn.id, startDate, endDate),
    getTrainerIncomeSummary(barn.id, startDate, endDate),
    getOutstandingLessons(barn.id),
    getOutstandingCharges(barn.id),
    getOutstandingCancellationFees(barn.id),
    getExpenseFinancialSummary(barn.id, startDate, endDate, barn.timezone),
    getOutstandingExpenses(barn.id, barn.timezone),
    getRecipientExpenseSummary(barn.id, startDate, endDate, barn.timezone),
  ])

  const outstandingItems = mergeOutstandingItems(outstandingLessons, outstandingCharges, outstandingCancellationFees)
  const outstandingTotal = outstandingItems.reduce((sum, i) => sum + i.fee, 0)
  const outstandingExpensesTotal = outstandingExpenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)

  // #971: reconciliation — every breakdown table's Gross/Expenses/Net columns
  // independently sum to the same barn-wide totals, derived from data already fetched
  // above (no extra queries). See src/lib/finances-reconciliation.ts.
  const totalGross = breakdown.reduce((sum, t) => sum + t.subtotal + t.instructorCut, 0)
  const totalCut = breakdown.reduce((sum, t) => sum + t.instructorCut, 0)
  const totalExpenses = totalCut + expenseSummary.totalExpenses
  const attributableHorseExpenses = expenseSummary.breakdown.reduce((sum, h) => sum + h.totalExpenses, 0)
  // An expense whose horse_expenses record was deleted but whose collected transaction
  // survives (deleteExpense's default) — counted in totalExpenses but absent from every
  // per-horse/per-recipient breakdown. Surfaced as "Unattributed" everywhere instead of
  // silently dropped.
  const unattributedExpenses = expenseSummary.totalExpenses - attributableHorseExpenses

  const tierRows = breakdown.filter((t) => t.tierName !== NON_LESSON_INCOME_LABEL)
  const tierGross = buildReconciliationColumn(totalGross, tierRows.reduce((sum, t) => sum + t.subtotal + t.instructorCut, 0), 0)
  const tierExpenses = buildReconciliationColumn(totalExpenses, tierRows.reduce((sum, t) => sum + t.instructorCut, 0), unattributedExpenses)
  const tierNet = deriveNetColumn(tierGross, tierExpenses)

  const realHorseIncome = horseIncome.filter((h) => h.horseId !== NO_HORSE_LABEL)
  const noHorseIncome = horseIncome.find((h) => h.horseId === NO_HORSE_LABEL)?.totalIncome ?? 0
  const horseRows = computeHorseNetIncome(realHorseIncome, expenseSummary.breakdown)
  const horseGross = buildReconciliationColumn(totalGross, realHorseIncome.reduce((sum, h) => sum + h.totalIncome, 0), noHorseIncome)
  const horseExpenses = buildReconciliationColumn(totalExpenses, attributableHorseExpenses, unattributedExpenses)
  const horseNet = deriveNetColumn(horseGross, horseExpenses)

  const realRiderIncome = riderIncome.filter((r) => r.riderId !== NO_RIDER_LABEL)
  const noRiderIncome = riderIncome.find((r) => r.riderId === NO_RIDER_LABEL)?.totalIncome ?? 0
  const riderGross = buildReconciliationColumn(totalGross, realRiderIncome.reduce((sum, r) => sum + r.totalIncome, 0), noRiderIncome)
  const riderExpenses = buildReconciliationColumn(totalExpenses, 0, unattributedExpenses)
  const riderNet = deriveNetColumn(riderGross, riderExpenses)

  const realTrainerIncome = trainerIncome.filter((t) => t.trainerId !== NON_LESSON_INCOME_LABEL && t.trainerId !== NO_INSTRUCTOR_LABEL)
  const noInstructorRow = trainerIncome.find((t) => t.trainerId === NO_INSTRUCTOR_LABEL)
  // grossIncome is only ever null on the synthetic NON_LESSON_INCOME_LABEL row (see
  // lesson-finances.ts), already excluded from realTrainerIncome/noInstructorRow — every
  // real per-trainer row (including "No instructor") has a numeric grossIncome.
  const noInstructorGross = noInstructorRow?.grossIncome ?? 0
  const noInstructorCut = noInstructorRow ? noInstructorRow.grossIncome! - noInstructorRow.totalIncome : 0
  const instructorGross = buildReconciliationColumn(totalGross, realTrainerIncome.reduce((sum, t) => sum + t.grossIncome!, 0), noInstructorGross)
  const instructorExpenses = buildReconciliationColumn(
    totalExpenses,
    realTrainerIncome.reduce((sum, t) => sum + (t.grossIncome! - t.totalIncome), 0),
    unattributedExpenses + noInstructorCut
  )
  const instructorNet = deriveNetColumn(instructorGross, instructorExpenses)

  const recipientExpensesColumn = buildReconciliationColumn(totalExpenses, recipientExpenses.reduce((sum, r) => sum + r.totalExpenses, 0), unattributedExpenses)

  // #971 review fix: gate each tab on whether there's ANY barn-wide money attributable
  // to its dimension — including money that falls into "Outside this view"/"Unattributed"
  // rather than a real per-entity row — so the reconciliation footer never silently
  // disappears just because every real row got filtered out (e.g. a boarding-only month
  // has zero real trainer rows, but the tab must still show that income as reconciled).
  const tierHasActivity = tierRows.some((t) => t.subtotal !== 0 || t.instructorCut !== 0) || tierGross.outside !== 0
  const horseHasActivity = horseRows.length > 0 || noHorseIncome !== 0 || unattributedExpenses > 0
  const riderHasActivity = riderIncome.length > 0
  const trainerHasActivity = trainerIncome.length > 0
  const recipientHasActivity = recipientExpenses.length > 0 || unattributedExpenses > 0

  const monthParam = formatMonthParam(startDate)
  const monthQ = isCurrentMonth ? '' : `&month=${monthParam}`
  const tabQ = tab !== 'horse' ? `&tab=${tab}` : ''
  const prevUrl = prevMonthUrl ? prevMonthUrl + tabQ : null
  const nextUrl = nextMonthUrl ? nextMonthUrl + tabQ : null

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Finances
      </h1>

      {outstandingItems.length > 0 && (
        <section className={`mb-10 ${outstandingTotal > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>
          <p className="text-sm font-medium uppercase tracking-wide">
            Outstanding Income
            <InfoPopover text="All-time unpaid lessons, leases, and boarding charges" />
          </p>
          <p className={`mt-1 text-2xl font-bold ${outstandingTotal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-50'}`}>
            {outstandingTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
          <div className="mt-4">
            <OutstandingTable items={outstandingItems} barnSlug={slug} />
          </div>
          <div className="mt-3">
            <Link
              href={`/barn/${slug}/finances/outstanding`}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              View all outstanding →
            </Link>
          </div>
        </section>
      )}

      {outstandingExpenses.length > 0 && (
        <section className="mb-10 text-amber-700 dark:text-amber-400">
          <p className="text-sm font-medium uppercase tracking-wide">
            Outstanding Expenses
            <InfoPopover text="Shown here because the expense is missing an amount, missing a payment type, or both" />
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatCurrency(outstandingExpensesTotal)}
          </p>
          <ul className="mt-4 space-y-1">
            {outstandingExpenses.map((expense) => (
              <li key={expense.id}>
                <Link
                  href={`/barn/${slug}/expenses/${expense.id}`}
                  className="text-sm text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  {formatShortDateOnly(expense.expense_date)} — {expense.recipient} — {expense.expense_type}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Raw Tailwind, not <Button>/<Pill>: unpadded circular icon-arrow nav
          control — no Button/Pill variant fits this shape. Deliberately reuses
          Pill's pillInactive color tokens (border-zinc-300/text-zinc-600/hover
          states) so it stays visually consistent with Pill if that palette
          ever changes. */}
      <div className="mb-8 flex items-center gap-4">
        {prevUrl ? (
          <Link href={prevUrl} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50">
            &lt;
          </Link>
        ) : (
          <span aria-hidden="true" className="invisible flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-zinc-300">&lt;</span>
        )}
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{monthLabel}</span>
        {nextUrl ? (
          <Link href={nextUrl} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50">
            &gt;
          </Link>
        ) : (
          <span aria-hidden="true" className="invisible flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-zinc-300">&gt;</span>
        )}
      </div>

      {isCurrentMonth && (
        <div className="mb-6 flex items-baseline gap-2">
          <span className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Pending income
            <InfoPopover text="Lessons scheduled this month that haven't been paid yet, net of the per-lesson instructor cut" />
          </span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatCurrency(pendingIncome)}</span>
        </div>
      )}

      <hr className="mb-6 border-zinc-200 dark:border-zinc-700" />

      <div className="mb-6 overflow-x-auto -mx-1">
        <div className="flex gap-2 whitespace-nowrap px-1 pb-2">
          <Pill href={`?tab=horse${monthQ}`} active={tab === 'horse'}>
            By Horse
          </Pill>
          <Pill href={`?tab=tier${monthQ}`} active={tab === 'tier'}>
            By Tier
          </Pill>
          <Pill href={`?tab=rider${monthQ}`} active={tab === 'rider'}>
            By Rider
          </Pill>
          <Pill href={`?tab=trainer${monthQ}`} active={tab === 'trainer'}>
            By Instructor
          </Pill>
          <Pill href={`?tab=recipient${monthQ}`} active={tab === 'recipient'}>
            By Paid To
          </Pill>
        </div>
      </div>

      {tab === 'tier' && (
        tierHasActivity ? (
          <ByTierTable rows={tierRows} gross={tierGross} expenses={tierExpenses} net={tierNet} />
        ) : (
          <EmptyState
            heading={`No lessons in ${monthLabel}.`}
            subtext="Lesson income will appear here once lessons are added."
          />
        )
      )}

      {tab === 'horse' && (
        horseHasActivity ? (
          <ByHorseTable rows={horseRows} slug={slug} monthParam={monthParam} gross={horseGross} expenses={horseExpenses} net={horseNet} />
        ) : (
          <EmptyState
            heading={`No horse activity in ${monthLabel}.`}
            subtext="Horse income and expenses will appear here once recorded."
          />
        )
      )}

      {tab === 'rider' && (
        riderHasActivity ? (
          <ByRiderTable rows={realRiderIncome} slug={slug} monthParam={monthParam} gross={riderGross} expenses={riderExpenses} net={riderNet} />
        ) : (
          <EmptyState
            heading={`No rider income in ${monthLabel}.`}
            subtext="Rider income will appear here once lessons are paid."
          />
        )
      )}

      {tab === 'trainer' && (
        trainerHasActivity ? (
          <ByInstructorTable
            rows={realTrainerIncome}
            slug={slug}
            monthParam={monthParam}
            gross={instructorGross}
            expenses={instructorExpenses}
            net={instructorNet}
          />
        ) : (
          <EmptyState
            heading={`No trainer income in ${monthLabel}.`}
            subtext="Instructor income will appear here once lessons are paid."
          />
        )
      )}

      {tab === 'recipient' && (
        recipientHasActivity ? (
          <ByPaidToTable rows={recipientExpenses} slug={slug} monthParam={monthParam} expenses={recipientExpensesColumn} />
        ) : (
          <EmptyState
            heading={`No expenses in ${monthLabel}.`}
            subtext="Expense breakdown by recipient will appear here once expenses are recorded."
          />
        )
      )}
    </main>
  )
}
