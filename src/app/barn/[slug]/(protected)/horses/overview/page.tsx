import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getHorseExertionSummary } from '@/lib/db/horses'

export default async function HorseOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ sort?: string }>
}) {
  const { slug } = await params
  const { sort } = await searchParams

  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) notFound()

  const membership = await getEffectiveMembership(data.user.id, barn.id)
  if (!membership || membership.status !== 'active') notFound()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const horses = await getHorseExertionSummary(barn.id, sevenDaysAgo)

  const sorted = [...horses].sort((a, b) =>
    sort === 'asc'
      ? a.totalExertion - b.totalExertion
      : b.totalExertion - a.totalExertion
  )

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name} — Horse Overview
      </h1>

      {horses.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No horses in this barn.</p>
      ) : (
        <>
          <div className="mb-4 flex gap-3 text-sm">
            <Link
              href={`/barn/${slug}/horses/overview?sort=desc`}
              className="font-medium text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
            >
              Exertion ↓
            </Link>
            <Link
              href={`/barn/${slug}/horses/overview?sort=asc`}
              className="font-medium text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
            >
              Exertion ↑
            </Link>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Horse</th>
                <th className="pb-2 pr-6">Lessons (7d)</th>
                <th className="pb-2">Total Exertion (7d)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((horse) => (
                <tr key={horse.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">{horse.name}</td>
                  <td className="py-3 pr-6 text-sm text-zinc-700 dark:text-zinc-300">{horse.lessonCount}</td>
                  <td className="py-3 text-sm text-zinc-700 dark:text-zinc-300">{horse.totalExertion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
