import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
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

  const horses = await getHorsesByBarn(barn.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name} — Horses
      </h1>

      {horses.length > 0 && (
        <table className="mb-12 w-full">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              <th className="pb-2 pr-6">Name</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {horses.map((horse) => (
              <tr key={horse.id} className="border-b border-zinc-100 dark:border-zinc-800">
                <form action={updateHorseAction.bind(null, slug, horse.id)} className="contents">
                  <td className="py-3 pr-6">
                    <input
                      type="text"
                      name="name"
                      defaultValue={horse.name}
                      required
                      className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </td>
                  <td className="py-3">
                    <button
                      type="submit"
                      className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Save
                    </button>
                  </td>
                </form>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section>
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
    </main>
  )
}
