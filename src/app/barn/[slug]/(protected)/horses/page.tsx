import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary } from '@/lib/db/horses'
import { HorseCard } from './HorseCard'
import { addHorseAction } from './actions'

export default async function HorsesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) notFound()

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active') notFound()

  const isManager = membership.role === 'manager'

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const horses = await getHorseExertionSummary(barn.id, sevenDaysAgo)

  const available = horses
    .filter((h) => h.is_active && h.is_available)
    .sort((a, b) => a.totalExertion - b.totalExertion)
  const unavailable = horses.filter((h) => h.is_active && !h.is_available)
  const inactive = horses.filter((h) => !h.is_active)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Horses</h1>
        {isManager && (
          <form action={addHorseAction.bind(null, slug)} className="flex gap-2">
            <input
              type="text"
              name="name"
              placeholder="Horse name"
              required
              className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add
            </button>
          </form>
        )}
      </div>

      {available.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available</h2>
          <div className="flex flex-col gap-2">
            {available.map((horse) => (
              <HorseCard key={horse.id} horse={horse} barnSlug={slug} variant="available" />
            ))}
          </div>
        </section>
      )}

      {unavailable.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Unavailable</h2>
          <div className="flex flex-col gap-2">
            {unavailable.map((horse) => (
              <HorseCard key={horse.id} horse={horse} barnSlug={slug} variant="unavailable" />
            ))}
          </div>
        </section>
      )}

      {isManager && inactive.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Inactive</h2>
          <div className="flex flex-col gap-2">
            {inactive.map((horse) => (
              <HorseCard key={horse.id} horse={horse} barnSlug={slug} variant="inactive" />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
