import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary, getHorseProjectedExhaustion, getHorsesByBarn, getOwnedHorses, resolveExhaustionThresholds } from '@/lib/db/horses'
import type { HorseExertionSummary } from '@/lib/db/types'
import { HorseCard } from './HorseCard'
import { addHorseAction } from './actions'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/Button'

type HorseCardData = Pick<HorseExertionSummary, 'id' | 'name' | 'registered_name' | 'is_active' | 'is_available' | 'unavailability_reason'>

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
  const isRider = membership.role === 'rider'

  const ownedHorses = await getOwnedHorses(barn.id, membership.id)
  const ownedIds = new Set(ownedHorses.map((h) => h.id))

  let available: HorseCardData[]
  let unavailable: HorseCardData[]
  let inactive: HorseExertionSummary[] = []
  let exhaustionByHorseId = new Map<
    string,
    { existingRows: Awaited<ReturnType<typeof getHorseProjectedExhaustion>>; thresholds: ReturnType<typeof resolveExhaustionThresholds> }
  >()

  if (isRider) {
    // Riders never get exertion/exhaustion data, not even via the RPC — see #765.
    const horses = await getHorsesByBarn(barn.id)
    available = horses.filter((h) => h.is_available && !ownedIds.has(h.id))
    unavailable = horses.filter((h) => !h.is_available && !ownedIds.has(h.id))
  } else {
    const today = new Date()
    const horses = await getHorseExertionSummary(barn.id, today)

    // #1000: owned horses are excluded here, before the exhaustion RPC fan-out below, since the
    // owned HorseCard variant never renders ExhaustionBar — same rationale as #765's rider skip.
    const availableFull = horses
      .filter((h) => h.is_active && h.is_available && !ownedIds.has(h.id))
      .sort((a, b) => a.totalExertion - b.totalExertion)
    const unavailableFull = horses.filter((h) => h.is_active && !h.is_available && !ownedIds.has(h.id))
    available = availableFull
    unavailable = unavailableFull
    inactive = horses.filter((h) => !h.is_active && !ownedIds.has(h.id))

    const activeHorses = [...availableFull, ...unavailableFull]
    exhaustionByHorseId = new Map(
      await Promise.all(
        activeHorses.map(async (h) => {
          const existingRows = await getHorseProjectedExhaustion(h.id, barn.id, today)
          const thresholds = resolveExhaustionThresholds(h, barn)
          return [h.id, { existingRows, thresholds }] as const
        })
      )
    )
  }

  const allEmpty =
    ownedHorses.length === 0 && available.length === 0 && unavailable.length === 0 && (!isManager || inactive.length === 0)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Horses</h1>
      {isManager && (
        <form action={addHorseAction.bind(null, slug)} className="mb-8 flex gap-2">
          <input
            type="text"
            name="name"
            placeholder="Horse name"
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <Button type="submit">Add</Button>
        </form>
      )}

      {ownedHorses.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">My Horses</h2>
          <div className="flex flex-col gap-2">
            {ownedHorses.map((horse) => (
              <HorseCard key={horse.id} horse={horse} barnSlug={slug} variant="owned" linkable />
            ))}
          </div>
        </section>
      )}

      {available.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available</h2>
          <div className="flex flex-col gap-2">
            {available.map((horse) => (
              <HorseCard
                key={horse.id}
                horse={horse}
                barnSlug={slug}
                variant="available"
                exhaustion={exhaustionByHorseId.get(horse.id)}
                linkable
              />
            ))}
          </div>
        </section>
      )}

      {unavailable.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Unavailable</h2>
          <div className="flex flex-col gap-2">
            {unavailable.map((horse) => (
              <HorseCard
                key={horse.id}
                horse={horse}
                barnSlug={slug}
                variant="unavailable"
                exhaustion={exhaustionByHorseId.get(horse.id)}
                linkable
              />
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

      {allEmpty && (
        <EmptyState
          heading="No horses yet"
          subtext={isManager ? 'Use the form above to add your first horse.' : 'No horses have been added yet.'}
        />
      )}
    </main>
  )
}
