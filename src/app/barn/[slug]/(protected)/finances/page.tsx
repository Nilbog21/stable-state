import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary } from '@/lib/db/lessons'
import { OutstandingTable } from './OutstandingTable'

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
  const endDate = isCurrentMonth
    ? now
    : new Date(Date.UTC(year, month + 1, 1))

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

  return { startDate, endDate, monthLabel, prevMonthUrl, nextMonthUrl }
}

export default async function FinancesPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ month?: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${slug}/login`)

  const actorMembership = await getEffectiveMembership(data.user.id, barn.id)

  if (
    !actorMembership ||
    actorMembership.status !== 'active' ||
    actorMembership.role !== 'manager'
  ) {
    redirect(`/barn/${slug}/login`)
  }

  const { month: monthParam } = await searchParams
  const { startDate, endDate, monthLabel, prevMonthUrl, nextMonthUrl } =
    resolveFinancesMonth(monthParam, barn.created_at, new Date())

  const [{ collectedIncome, pendingIncome, outstandingLessons, breakdown }, horseIncome, riderIncome] = await Promise.all([
    getFinancialSummary(barn.id, startDate, endDate),
    getHorseIncomeSummary(barn.id, startDate, endDate),
    getRiderIncomeSummary(barn.id, startDate, endDate),
  ])

  const outstandingTotal = outstandingLessons.reduce((sum, l) => sum + (l.fee ?? 0), 0)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name} — Finances
      </h1>

      <div className="mb-8 flex items-center gap-4">
        {prevMonthUrl ? (
          <Link href={prevMonthUrl} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
            ←
          </Link>
        ) : null}
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{monthLabel}</span>
        {nextMonthUrl ? (
          <Link href={nextMonthUrl} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">
            →
          </Link>
        ) : null}
      </div>

      <section className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {`Collected income (${monthLabel})`}
        </p>
        <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          {collectedIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </p>
      </section>

      {breakdown.length > 0 ? (
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="pb-2 pr-6">Fee</th>
              <th className="pb-2 pr-6">Lessons</th>
              <th className="pb-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((tier) => (
              <tr key={tier.fee} className="border-b border-zinc-100 dark:border-zinc-800">
                <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">{tier.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">{tier.lessonCount}</td>
                <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">{tier.subtotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{`No lessons in ${monthLabel}.`}</p>
      )}

      <section className="mt-10">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Pending income
        </p>
        <p className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {pendingIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </p>
      </section>

      <section className={`mt-10 ${outstandingTotal > 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>
        <p className="text-sm font-medium uppercase tracking-wide">
          Outstanding
        </p>
        <p className={`mt-1 text-2xl font-bold ${outstandingTotal > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-900 dark:text-zinc-50'}`}>
          {outstandingTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </p>
        <div className="mt-4">
          <OutstandingTable outstandingLessons={outstandingLessons} barnId={barn.id} />
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Income by Horse
        </h2>
        {horseIncome.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Horse</th>
                <th className="pb-2">Income</th>
              </tr>
            </thead>
            <tbody>
              {horseIncome.map((row) => (
                <tr key={row.horseId} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
                    <Link
                      href={`/barn/${slug}/finances/horses/${row.horseId}`}
                      className="hover:underline"
                    >
                      {row.horseName}
                    </Link>
                  </td>
                  <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">
                    {row.totalIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{`No horse income in ${monthLabel}.`}</p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Income by Rider
        </h2>
        {riderIncome.length > 0 ? (
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
                      href={`/barn/${slug}/finances/riders/${row.riderId}`}
                      className="hover:underline"
                    >
                      {row.riderName}
                    </Link>
                  </td>
                  <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">
                    {row.totalIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{`No rider income in ${monthLabel}.`}</p>
        )}
      </section>
    </main>
  )
}
