import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getHorseExertionSummary } from '@/lib/db/horses'
import { HorseOverviewTable } from './HorseOverviewTable'
import { addHorseAction, updateHorseAction } from './actions'

export default async function HorsesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) notFound()

  const membership = await getEffectiveMembership(data.user.id, barn.id)
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

      {/* <form> cannot be a valid descendant of <table>, so update forms live here
          and are linked to their row controls via the HTML `form` attribute. */}
      {isManager && horses.map((horse) => (
        <form
          key={`update-${horse.id}`}
          id={`update-horse-${horse.id}`}
          action={updateHorseAction.bind(null, slug, horse.id)}
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

      <HorseOverviewTable horses={horses} isManager={isManager} />
    </main>
  )
}
