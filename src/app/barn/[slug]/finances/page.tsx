import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import { getFinancialSummary } from '@/lib/db/lessons'

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

  const barnMembership = await getUserMembership(data.user.id, barn.id)
  const adminMembership = barnMembership ? null : await getAdminMembership(data.user.id)
  const actorMembership = barnMembership ?? adminMembership

  if (
    !actorMembership ||
    actorMembership.status !== 'active' ||
    (actorMembership.role !== 'manager' && actorMembership.role !== 'admin')
  ) {
    redirect(`/barn/${slug}/login`)
  }

  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(endDate.getDate() - 30)

  const { totalIncome, breakdown } = await getFinancialSummary(barn.id, startDate, endDate)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name} — Finances
      </h1>

      <section className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Total income (past 30 days)
        </p>
        <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          ${totalIncome}
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
                <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">${tier.fee}</td>
                <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">{tier.lessonCount}</td>
                <td className="py-3 text-sm text-zinc-900 dark:text-zinc-50">${tier.subtotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No lessons in the past 30 days.</p>
      )}
    </main>
  )
}
