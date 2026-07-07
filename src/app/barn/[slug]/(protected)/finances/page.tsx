import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getFinancialSummary, getOutstandingLessons, getHorseIncomeSummary, getRiderIncomeSummary, getTrainerIncomeSummary, mergeOutstandingItems, NON_LESSON_INCOME_LABEL } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import { getExpenseFinancialSummary } from '@/lib/db/expenses'
import { formatCurrency } from '@/lib/format-currency'
import { OutstandingTable } from './OutstandingTable'
import { InfoPopover } from './InfoPopover'
import { Th, Td } from '@/components/ui/Table'

const VALID_TABS = ['horse', 'tier', 'rider', 'trainer'] as const
type Tab = typeof VALID_TABS[number]

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

function toMonthIndex(year: number, month: number): number {
  return year * 12 + month
}

export function resolveFinancesMonth(
  monthParam: string | undefined,
  barnCreatedAt: string,
  now: Date
): {
  startDate: Date
  endDate: Date
  monthLabel: string
  isCurrentMonth: boolean
  prevMonthUrl: string | null
  nextMonthUrl: string | null
} {
  const nowYear = now.getUTCFullYear()
  const nowMonth = now.getUTCMonth()

  let year = nowYear
  let month = nowMonth

  if (monthParam) {
    const parts = monthParam.split('-')
    const parsedYear = parseInt(parts[0], 10)
    const parsedMonth = parseInt(parts[1], 10) - 1
    if (
      parts.length === 2 &&
      !isNaN(parsedYear) &&
      !isNaN(parsedMonth) &&
      parsedMonth >= 0 &&
      parsedMonth <= 11
    ) {
      year = parsedYear
      month = parsedMonth
    }
  }

  const barnDate = new Date(barnCreatedAt)
  const barnYear = isNaN(barnDate.getTime()) ? 0 : barnDate.getUTCFullYear()
  const barnMonth = isNaN(barnDate.getTime()) ? 0 : barnDate.getUTCMonth()

  if (toMonthIndex(year, month) < toMonthIndex(barnYear, barnMonth)) {
    year = barnYear
    month = barnMonth
  }
  if (toMonthIndex(year, month) > toMonthIndex(nowYear, nowMonth)) {
    year = nowYear
    month = nowMonth
  }

  const startDate = new Date(Date.UTC(year, month, 1))
  const isCurrentMonth = year === nowYear && month === nowMonth
  const endDate = new Date(Date.UTC(year, month + 1, 1))

  const monthLabel =
    new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }) +
    ' ' +
    year

  const atBarnFirst = toMonthIndex(year, month) === toMonthIndex(barnYear, barnMonth)
  let prevMonthUrl: string | null = null
  if (!atBarnFirst) {
    const prevYear = month === 0 ? year - 1 : year
    const prevMonth = month === 0 ? 11 : month - 1
    prevMonthUrl = `?month=${pad4(prevYear)}-${pad2(prevMonth + 1)}`
  }

  let nextMonthUrl: string | null = null
  if (!isCurrentMonth) {
    const nextYear = month === 11 ? year + 1 : year
    const nextMonth = month === 11 ? 0 : month + 1
    nextMonthUrl = `?month=${pad4(nextYear)}-${pad2(nextMonth + 1)}`
  }

  return { startDate, endDate, monthLabel, isCurrentMonth, prevMonthUrl, nextMonthUrl }
}

const pillBase = 'rounded-full px-4 py-1.5 text-sm font-medium transition-colors'
const pillActive = 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
const pillInactive = 'border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50'

export default async function FinancesPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ month?: string; tab?: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const actorMembership = await getUserMembership(user.id, barn.id)

  if (
    !actorMembership ||
    actorMembership.status !== 'active' ||
    actorMembership.role !== 'manager'
  ) {
    redirect(`/barn/${slug}/login`)
  }

  const { month: monthParam, tab: tabParam } = await searchParams
  const tab: Tab = VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'horse'

  const { startDate, endDate, monthLabel, isCurrentMonth, prevMonthUrl, nextMonthUrl } =
    resolveFinancesMonth(monthParam, barn.created_at, new Date())

  const [{ collectedIncome, pendingIncome, breakdown }, horseIncome, riderIncome, trainerIncome, outstandingLessons, outstandingCharges, expenseSummary] = await Promise.all([
    getFinancialSummary(barn.id, startDate, endDate, barn.instructor_cut),
    getHorseIncomeSummary(barn.id, startDate, endDate, barn.instructor_cut),
    getRiderIncomeSummary(barn.id, startDate, endDate, barn.instructor_cut),
    getTrainerIncomeSummary(barn.id, startDate, endDate, barn.instructor_cut),
    getOutstandingLessons(barn.id),
    getOutstandingCharges(barn.id),
    getExpenseFinancialSummary(barn.id, startDate, endDate),
  ])

  const outstandingItems = mergeOutstandingItems(outstandingLessons, outstandingCharges)
  const outstandingTotal = outstandingItems.reduce((sum, i) => sum + i.fee, 0)

  const netIncome = collectedIncome - expenseSummary.totalExpenses

  const expenseByHorse = new Map(expenseSummary.breakdown.map((e) => [e.horseId, e]))
  const incomeByHorse = new Map(horseIncome.map((h) => [h.horseId, h]))
  const horseRows = [...new Set([...incomeByHorse.keys(), ...expenseByHorse.keys()])]
    .map((horseId) => {
      const income = incomeByHorse.get(horseId)
      const expenses = expenseByHorse.get(horseId)
      return {
        horseId,
        // horseId always comes from one of the two maps' keys, so this is never undefined
        horseName: (income ?? expenses)!.horseName,
        income: income?.totalIncome ?? 0,
        expenses: expenses?.totalExpenses ?? 0,
        net: (income?.totalIncome ?? 0) - (expenses?.totalExpenses ?? 0),
      }
    })
    .sort((a, b) => b.income - a.income || a.horseName.localeCompare(b.horseName))

  const monthQ = isCurrentMonth ? '' : `&month=${pad4(startDate.getUTCFullYear())}-${pad2(startDate.getUTCMonth() + 1)}`
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

      <div className="mb-8 flex items-center gap-4">
        {prevUrl ? (
          <Link href={prevUrl} className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50">
            &lt;
          </Link>
        ) : (
          <span aria-hidden="true" className="invisible flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300">&lt;</span>
        )}
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{monthLabel}</span>
        {nextUrl ? (
          <Link href={nextUrl} className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50">
            &gt;
          </Link>
        ) : (
          <span aria-hidden="true" className="invisible flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300">&gt;</span>
        )}
      </div>

      <section className="mb-4">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Collected income
          <InfoPopover text="Lessons paid this month, net of the per-lesson instructor cut" />
        </p>
        <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          {formatCurrency(collectedIncome)}
        </p>
      </section>

      <section className="mb-4">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Total Expenses
        </p>
        <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {formatCurrency(expenseSummary.totalExpenses)}
        </p>
      </section>

      <section className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Net
        </p>
        <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {formatCurrency(netIncome)}
        </p>
      </section>

      {isCurrentMonth && (
        <section className="mb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Pending income (from scheduled lessons)
            <InfoPopover text="Lessons scheduled this month that haven't been paid yet, net of the per-lesson instructor cut" />
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {formatCurrency(pendingIncome)}
          </p>
        </section>
      )}

      <hr className="mb-6 border-zinc-200 dark:border-zinc-700" />

      <div className="mb-6 overflow-x-auto -mx-1">
        <div className="flex gap-2 whitespace-nowrap px-1 pb-2">
          <Link href={`?tab=horse${monthQ}`} className={`${pillBase} ${tab === 'horse' ? pillActive : pillInactive}`}>
            By Horse
          </Link>
          <Link href={`?tab=tier${monthQ}`} className={`${pillBase} ${tab === 'tier' ? pillActive : pillInactive}`}>
            By Tier
          </Link>
          <Link href={`?tab=rider${monthQ}`} className={`${pillBase} ${tab === 'rider' ? pillActive : pillInactive}`}>
            By Rider
          </Link>
          <Link href={`?tab=trainer${monthQ}`} className={`${pillBase} ${tab === 'trainer' ? pillActive : pillInactive}`}>
            By Trainer
          </Link>
        </div>
      </div>

      {tab === 'tier' && (
        breakdown.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Tier</th>
                <th className="pb-2 pr-6">Price</th>
                <th className="pb-2 pr-6">Lessons</th>
                <th className="pb-2 pr-6">Instructor Cut</th>
                <th className="pb-2">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((tier) => (
                <tr key={tier.tierName} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                    {tier.tierName}
                    {tier.tierName === NON_LESSON_INCOME_LABEL && <InfoPopover text="Includes leases and boarding" align="left" />}
                  </td>
                  <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                    {tier.price != null ? tier.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '—'}
                  </td>
                  <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">{tier.lessonCount}</td>
                  <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                    {tier.instructorCut === 0 ? '—' : formatCurrency(tier.instructorCut, { forceParens: true })}
                  </td>
                  <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">{formatCurrency(tier.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{`No lessons in ${monthLabel}.`}</p>
        )
      )}

      {tab === 'horse' && (
        horseRows.length > 0 ? (
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
                    <Link
                      href={`/barn/${slug}/finances/horses/${row.horseId}?month=${pad4(startDate.getUTCFullYear())}-${pad2(startDate.getUTCMonth() + 1)}`}
                      className="hover:underline"
                    >
                      {row.horseName}
                    </Link>
                  </Td>
                  <Td>{formatCurrency(row.income)}</Td>
                  <Td>{formatCurrency(row.expenses)}</Td>
                  <Td>{formatCurrency(row.net)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{`No horse activity in ${monthLabel}.`}</p>
        )
      )}

      {tab === 'rider' && (
        riderIncome.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Rider</th>
                <th className="pb-2">Income</th>
              </tr>
            </thead>
            <tbody>
              {riderIncome.map((row) => (
                <tr key={row.riderId} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                    <Link
                      href={`/barn/${slug}/finances/riders/${row.riderId}?month=${pad4(startDate.getUTCFullYear())}-${pad2(startDate.getUTCMonth() + 1)}`}
                      className="hover:underline"
                    >
                      {row.riderName}
                    </Link>
                  </td>
                  <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">
                    {formatCurrency(row.totalIncome)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{`No rider income in ${monthLabel}.`}</p>
        )
      )}

      {tab === 'trainer' && (
        trainerIncome.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Trainer</th>
                <th className="pb-2">Income</th>
              </tr>
            </thead>
            <tbody>
              {trainerIncome.map((row) => (
                <tr key={row.trainerId} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                    {row.trainerName}
                    {row.trainerId === NON_LESSON_INCOME_LABEL && <InfoPopover text="Includes leases and boarding" align="left" />}
                  </td>
                  <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">
                    {formatCurrency(row.totalIncome)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{`No trainer income in ${monthLabel}.`}</p>
        )
      )}
    </main>
  )
}
