import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getFinancialSummary, getHorseIncomeSummary, getRiderIncomeSummary } from '@/lib/db/lessons'

export default async function FinancesPage({
  params,
}: {
  params: Promise<{ slug: string }>
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

  const endDate = new Date()
  const startDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1))
  const monthLabel = `${endDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${endDate.getUTCFullYear()}`

  const [{ totalIncome, breakdown }, horseIncome, riderIncome] = await Promise.all([
    getFinancialSummary(barn.id, startDate, endDate),
    getHorseIncomeSummary(barn.id, startDate, endDate),
    getRiderIncomeSummary(barn.id, startDate, endDate),
  ])

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name} — Finances
      </h1>

      <section className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {`Total income (${monthLabel})`}
        </p>
        <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          {totalIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
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
