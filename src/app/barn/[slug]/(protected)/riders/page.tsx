import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getRidersByBarn } from '@/lib/db/riders'
import { updateRiderAction } from './actions'

export default async function RidersPage({
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

  const actorMembership = await getEffectiveMembership(data.user.id, barn.id)

  if (
    !actorMembership ||
    actorMembership.status !== 'active' ||
    (actorMembership.role !== 'manager' && actorMembership.role !== 'trainer')
  ) {
    redirect(`/barn/${slug}/login`)
  }

  const riders = await getRidersByBarn(barn.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Riders
      </h1>

      {riders.length > 0 ? (
        <>
          {/* <form> cannot be a valid child of <tr>, so update forms live here
              and are associated to their row controls via the HTML `form` attribute. */}
          {riders.map((rider) => (
            <form
              key={`update-${rider.id}`}
              id={`update-rider-${rider.id}`}
              action={updateRiderAction.bind(null, slug, rider.id)}
            />
          ))}
          <table className="mb-12 w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Name</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((rider) => (
                <tr key={rider.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-6">
                    <input
                      type="text"
                      name="name"
                      form={`update-rider-${rider.id}`}
                      defaultValue={rider.name}
                      required
                      className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </td>
                  <td className="py-3">
                    <button
                      type="submit"
                      form={`update-rider-${rider.id}`}
                      className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No riders yet.</p>
      )}
    </main>
  )
}
