import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseById } from '@/lib/db/horses'
import { HorseAvailabilityForm } from './HorseAvailabilityForm'
import { HorseActivationSection } from './HorseActivationSection'
import { updateHorseAvailabilityAction, renameHorseAction, setHorseActiveAction } from './actions'

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
  const boundAvailabilityAction = updateHorseAvailabilityAction.bind(null, slug, horse.id)
  const boundRenameAction = renameHorseAction.bind(null, slug, horse.id)
  const boundActivationAction = setHorseActiveAction.bind(null, slug, horse.id, !horse.is_active)

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
        <>
          <section className="mt-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Name</h2>
            <form action={boundRenameAction} className="flex items-center gap-3">
              <label htmlFor="horse-name" className="sr-only">Name</label>
              <input
                id="horse-name"
                name="name"
                type="text"
                defaultValue={horse.name}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Save
              </button>
            </form>
          </section>

          <section className="mt-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Availability</h2>
            <HorseAvailabilityForm horse={horse} action={boundAvailabilityAction} />
          </section>

          <HorseActivationSection isActive={horse.is_active} action={boundActivationAction} />
        </>
      )}
    </main>
  )
}
