import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getHorseExertionSummary } from '@/lib/db/horses'
import { HorseOverviewTable } from './HorseOverviewTable'
import { addHorseAction, updateHorseAction, setHorseActiveAction } from './actions'

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Horses
      </h1>

      {/* <form> cannot be a valid descendant of <table>, so forms live here outside the table.
          Update forms are linked to row inputs via the HTML `form` attribute.
          Toggle forms are submitted imperatively via getElementById().requestSubmit()
          because the Set Inactive path needs a confirm() before submission. */}
      {isManager && horses.map((horse) => (
        <form
          key={`update-${horse.id}`}
          id={`update-horse-${horse.id}`}
          action={updateHorseAction.bind(null, slug, horse.id)}
        />
      ))}
      {isManager && horses.map((horse) => (
        <form
          key={`toggle-${horse.id}`}
          id={`toggle-horse-${horse.id}`}
          action={setHorseActiveAction.bind(null, slug, horse.id, !horse.is_active)}
        />
      ))}

      {isManager && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Add Horse</h2>
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
        </section>
      )}

      <HorseOverviewTable horses={horses} isManager={isManager} barnSlug={slug} />
    </main>
  )
}
