import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary, getHorseProjectedExhaustion, getHorsesByBarn, getOwnedHorses, resolveExhaustionThresholds } from '@/lib/db/horses'
import { getMyHorseLessonReadPrivilege } from '@/lib/db/member-horse-privileges'
import type { Horse, HorseExertionSummary } from '@/lib/db/types'
import { HorseCard } from './HorseCard'
import { addHorseAction } from './actions'
import { GuardedForm } from '../NavigationBlocker'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/Button'

type HorseCardData = Pick<HorseExertionSummary, 'id' | 'name' | 'registered_name' | 'is_active' | 'is_available' | 'unavailability_reason'>

// The two branches feed this from different sources — HorseExertionSummary rows for
// manager/trainer, plain Horse rows for the owned cards — so it's the columns
// getHorseProjectedExhaustion and resolveExhaustionThresholds actually need, and nothing else.
type ExhaustionSubject = { id: string } & Pick<Horse, 'exhaustion_threshold_high' | 'exhaustion_threshold_moderate'>

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
  let exhaustionSubjects: ExhaustionSubject[]

  const today = new Date()

  if (isRider) {
    // A rider's own horse is the one place a rider sees exhaustion (#1391). #765's blanket
    // "riders never get exertion/exhaustion data, not even via the RPC" predates the #997/#999
    // privilege model: get_horse_projected_exhaustion admits a rider holding
    // lesson_read_privileges on the horse, and raises for one holding none. So the grant is
    // checked here rather than inferred from ownership — set_horse_owner does elevate it when
    // it makes a member the owner, but a manager can toggle it back off without clearing
    // ownership, and an unchecked call would 500 this page for that rider.
    // get_horse_exertion_summary stays manager/trainer-only, so Available/Unavailable still
    // come from a plain getHorsesByBarn list with no bar.
    const horses = await getHorsesByBarn(barn.id)
    available = horses.filter((h) => h.is_available && !ownedIds.has(h.id))
    unavailable = horses.filter((h) => !h.is_available && !ownedIds.has(h.id))

    const privileged = await Promise.all(
      ownedHorses.map(async (h) => ((await getMyHorseLessonReadPrivilege(h.id, barn.id)) ? h : null))
    )
    exhaustionSubjects = privileged.filter((h) => h !== null)
  } else {
    const horses = await getHorseExertionSummary(barn.id, today)

    // Owned horses come out of these three sections and are rendered by My Horses instead
    // (#1000); they rejoin the exhaustion fan-out below.
    //
    // No sort of any kind here (#1553): get_horse_exertion_summary ends in `ORDER BY h.name`, so
    // all three sections read A-Z off the RPC. #936's total-exertion-ascending sort on Available
    // answered "which horse has capacity" — the lesson-detail page's question, not this page's,
    // where the user is looking for a named horse.
    const availableFull = horses.filter((h) => h.is_active && h.is_available && !ownedIds.has(h.id))
    const unavailableFull = horses.filter((h) => h.is_active && !h.is_available && !ownedIds.has(h.id))
    available = availableFull
    unavailable = unavailableFull
    inactive = horses.filter((h) => !h.is_active && !ownedIds.has(h.id))

    // #1391 reversed #1000's skip: the owned card renders ExhaustionBar now. Their thresholds
    // come off the getOwnedHorses rows rather than the summary, whose owned entries the filters
    // above have already dropped.
    exhaustionSubjects = [...availableFull, ...unavailableFull, ...ownedHorses]
  }

  const exhaustionByHorseId = new Map(
    await Promise.all(
      exhaustionSubjects.map(async (h) => {
        const existingRows = await getHorseProjectedExhaustion(h.id, barn.id, today, barn.timezone)
        const thresholds = resolveExhaustionThresholds(h, barn)
        return [h.id, { existingRows, thresholds }] as const
      })
    )
  )

  const allEmpty =
    ownedHorses.length === 0 && available.length === 0 && unavailable.length === 0 && (!isManager || inactive.length === 0)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Horses</h1>
      {isManager && (
        <GuardedForm action={addHorseAction.bind(null, slug)} className="mb-8 flex gap-2">
          <input
            type="text"
            name="name"
            placeholder="Horse name"
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <Button type="submit">Add</Button>
        </GuardedForm>
      )}

      {ownedHorses.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">My Horses</h2>
          <div className="flex flex-col gap-2">
            {ownedHorses.map((horse) => (
              <HorseCard
                key={horse.id}
                horse={horse}
                barnSlug={slug}
                variant="owned"
                exhaustion={exhaustionByHorseId.get(horse.id)}
                linkable
              />
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
