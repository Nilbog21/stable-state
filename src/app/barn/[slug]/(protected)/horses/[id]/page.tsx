import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseById } from '@/lib/db/horses'
import { HorseAvailabilityForm } from './HorseAvailabilityForm'
import { updateHorseAvailabilityAction } from './actions'

export default async function HorseDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) notFound()

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active') notFound()

  const horse = await getHorseById(id, barn.id)
  if (!horse) notFound()

  const role = membership.role
  const boundAction = updateHorseAvailabilityAction.bind(null, slug, horse.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {horse.name}
      </h1>

      <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
        <div className="flex flex-col gap-1 py-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</dt>
          <dd className="text-sm text-zinc-900 dark:text-zinc-50">
            {horse.is_available ? 'Available' : 'Unavailable'}
          </dd>
        </div>

        {role !== 'manager' && !horse.is_available && horse.unavailability_reason && (
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Reason</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{horse.unavailability_reason}</dd>
          </div>
        )}
      </dl>

      {role === 'manager' && (
        <section className="mt-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Availability</h2>
          <HorseAvailabilityForm horse={horse} action={boundAction} />
        </section>
      )}
    </main>
  )
}
