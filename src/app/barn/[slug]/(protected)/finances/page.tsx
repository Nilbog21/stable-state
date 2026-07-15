import Link from 'next/link'
import { requireMembership } from '@/lib/auth/guard'
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary, computeHorseNetIncome, NON_LESSON_INCOME_LABEL, NO_INSTRUCTOR_LABEL, NO_HORSE_LABEL, NO_RIDER_LABEL } from '@/lib/db/lesson-finances'
import { getOutstandingLessons, getOutstandingCancellationFees, mergeOutstandingItems } from '@/lib/db/outstanding'
import { getOutstandingCharges } from '@/lib/db/agreements'
import { getPastDueExpenses } from '@/lib/db/expenses'
import { getExpenseFinancialSummary } from '@/lib/db/expense-finances'
import { resolveFinancesMonth, formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import { formatShortDateOnly } from '@/lib/format-date'
import { OutstandingTable } from './OutstandingTable'
import { InfoPopover } from './InfoPopover'
import { Th, Td } from '@/components/ui/Table'
import { Pill } from '@/components/ui/Pill'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/EmptyState'

const VALID_TABS = ['horse', 'tier', 'rider', 'trainer'] as const
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

  const { month: monthParam, tab: tabParam } = await searchParams
  const tab: Tab = VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'horse'

  const { startDate, endDate, monthLabel, isCurrentMonth, prevMonthUrl, nextMonthUrl } =
    resolveFinancesMonth(monthParam, barn.created_at, new Date())

  const [{ collectedIncome, pendingIncome, breakdown }, horseIncome, riderIncome, trainerIncome, outstandingLessons, outstandingCharges, outstandingCancellationFees, expenseSummary, pastDueExpenses] = await Promise.all([
    getFinancialSummary(barn.id, startDate, endDate),
    getHorseIncomeSummary(barn.id, startDate, endDate),
    getRiderIncomeSummary(barn.id, startDate, endDate),
    getTrainerIncomeSummary(barn.id, startDate, endDate),
    getOutstandingLessons(barn.id),
    getOutstandingCharges(barn.id),
    getOutstandingCancellationFees(barn.id),
    getExpenseFinancialSummary(barn.id, startDate, endDate),
    getPastDueExpenses(barn.id),
  ])

  const outstandingItems = mergeOutstandingItems(outstandingLessons, outstandingCharges, outstandingCancellationFees)
  const outstandingTotal = outstandingItems.reduce((sum, i) => sum + i.fee, 0)

  const netIncome = collectedIncome - expenseSummary.totalExpenses

  const horseRows = computeHorseNetIncome(horseIncome, expenseSummary.breakdown)

  const monthQ = isCurrentMonth ? '' : `&month=${formatMonthParam(startDate)}`
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
            Outstanding
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

      {pastDueExpenses.length > 0 && (
        <section className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Needs an amount
          </p>
          <ul className="mt-2 space-y-1">
            {pastDueExpenses.map((expense) => (
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

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <section>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Collected income
              <InfoPopover text="Lessons paid this month, net of the per-lesson instructor cut" />
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(collectedIncome)}
            </p>
          </section>
        </Card>

        <Card className="p-4">
          <section>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Total Expenses
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(expenseSummary.totalExpenses)}
            </p>
          </section>
        </Card>

        <Card className="p-4">
          <section>
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Net
            </p>
            <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {formatCurrency(netIncome)}
            </p>
          </section>
        </Card>

        {isCurrentMonth && (
          <Card className="p-4">
            <section>
              <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Pending income
                <InfoPopover text="Lessons scheduled this month that haven't been paid yet, net of the per-lesson instructor cut" />
              </p>
              <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {formatCurrency(pendingIncome)}
              </p>
            </section>
          </Card>
        )}
      </div>

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
        </div>
      </div>

      {tab === 'tier' && (
        breakdown.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Tier</Th>
                  <Th>Price</Th>
                  <Th>Lessons</Th>
                  <Th>Instructor Cut</Th>
                  <Th>Subtotal</Th>
                </tr>
              </thead>
              <tbody>
                {/* ponytail: tierName === NON_LESSON_INCOME_LABEL assumes no real tier is ever named "Non-lesson income" (same assumption elsewhere in this file for NO_HORSE_LABEL/NO_RIDER_LABEL/NO_INSTRUCTOR_LABEL); switch synthetic rows to a discriminated shape if that collision risk ever becomes real */}
                {breakdown.map((tier) => (
                  <tr key={tier.tierName}>
                    <Td>
                      {tier.tierName}
                      {tier.tierName === NON_LESSON_INCOME_LABEL && <InfoPopover text="Includes leases and boarding" align="left" />}
                    </Td>
                    <Td>
                      {tier.price != null ? tier.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—'}
                    </Td>
                    <Td>{tier.tierName === NON_LESSON_INCOME_LABEL ? '' : tier.lessonCount}</Td>
                    <Td>
                      {tier.instructorCut === 0 ? '—' : formatCurrency(tier.instructorCut, { forceParens: true })}
                    </Td>
                    <Td>{formatCurrency(tier.subtotal)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            heading={`No lessons in ${monthLabel}.`}
            subtext="Lesson income will appear here once lessons are added."
          />
        )
      )}

      {tab === 'horse' && (
        horseRows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Horse</Th>
                  <Th>Income</Th>
                  <Th>Expenses</Th>
                  <Th>Net</Th>
                </tr>
              </thead>
              <tbody>
                {horseRows.map((row) => (
                  <tr key={row.horseId}>
                    <Td>
                      {row.horseId === NO_HORSE_LABEL ? (
                        <>
                          {row.horseName}
                          <InfoPopover text="Paid lessons with no horse recorded" align="left" />
                        </>
                      ) : (
                        <Link
                          href={`/barn/${slug}/finances/horses/${row.horseId}?month=${formatMonthParam(startDate)}`}
                          className="underline"
                        >
                          {row.horseName}
                        </Link>
                      )}
                    </Td>
                    <Td>{formatCurrency(row.income)}</Td>
                    <Td>{formatCurrency(row.expenses)}</Td>
                    <Td>{formatCurrency(row.net)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            heading={`No horse activity in ${monthLabel}.`}
            subtext="Horse income and expenses will appear here once recorded."
          />
        )
      )}

      {tab === 'rider' && (
        riderIncome.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Rider</Th>
                  <Th>Income</Th>
                </tr>
              </thead>
              <tbody>
                {riderIncome.map((row) => (
                  <tr key={row.riderId}>
                    <Td>
                      {row.riderId === NO_RIDER_LABEL ? (
                        <>
                          {row.riderName}
                          <InfoPopover text="Paid lessons with no rider recorded" align="left" />
                        </>
                      ) : (
                        <Link
                          href={`/barn/${slug}/finances/riders/${row.riderId}?month=${formatMonthParam(startDate)}`}
                          className="underline"
                        >
                          {row.riderName}
                        </Link>
                      )}
                    </Td>
                    <Td>
                      {formatCurrency(row.totalIncome)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            heading={`No rider income in ${monthLabel}.`}
            subtext="Rider income will appear here once lessons are paid."
          />
        )
      )}

      {tab === 'trainer' && (
        trainerIncome.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Trainer</Th>
                  <Th>Total Income</Th>
                  <Th>Instructor Cut</Th>
                  <Th>Net</Th>
                </tr>
              </thead>
              <tbody>
                {trainerIncome.map((row) => (
                  <tr key={row.trainerId}>
                    <Td>
                      {row.trainerId === NON_LESSON_INCOME_LABEL || row.trainerId === NO_INSTRUCTOR_LABEL ? (
                        <>
                          {row.trainerName}
                          {row.trainerId === NON_LESSON_INCOME_LABEL && <InfoPopover text="Includes leases and boarding" align="left" />}
                          {row.trainerId === NO_INSTRUCTOR_LABEL && <InfoPopover text="Lessons whose instructor was removed from the barn" align="left" />}
                        </>
                      ) : (
                        <Link
                          href={`/barn/${slug}/finances/trainers/${row.trainerId}?month=${formatMonthParam(startDate)}`}
                          className="underline"
                        >
                          {row.trainerName}
                        </Link>
                      )}
                    </Td>
                    <Td>
                      {row.grossIncome != null ? formatCurrency(row.grossIncome) : '—'}
                    </Td>
                    <Td>
                      {row.grossIncome != null ? formatCurrency(row.grossIncome - row.totalIncome, { forceParens: true }) : '—'}
                    </Td>
                    <Td>
                      {formatCurrency(row.totalIncome)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            heading={`No trainer income in ${monthLabel}.`}
            subtext="Instructor income will appear here once lessons are paid."
          />
        )
      )}
    </main>
  )
}
