import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import {
  createTierAction,
  updateTierAction,
  setDefaultTierAction,
  deactivateTierAction,
} from './actions'

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ error?: string; errorTierId?: string }>
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
    actorMembership.role !== 'manager'
  ) {
    redirect(`/barn/${slug}/login`)
  }

  const { error, errorTierId } = await searchParams
  const tiers = await getAllTiersByBarn(barn.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name} — Settings
      </h1>

      {/* <form> cannot be a valid child of <tr>, so save forms live here and
          are associated to their row controls via the HTML `form` attribute. */}
      {tiers.map((tier) => (
        <form
          key={`update-${tier.id}`}
          id={`update-tier-${tier.id}`}
          action={updateTierAction.bind(null, slug, tier.id)}
        />
      ))}

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Lesson Tiers
        </h2>

        {tiers.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Price</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Save</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.id} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="py-3 pr-4 align-top">
                    <input
                      type="text"
                      name="name"
                      form={`update-tier-${tier.id}`}
                      defaultValue={tier.name}
                      required
                      className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                    {tier.is_default && (
                      <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
                        Default
                      </span>
                    )}
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                      Renaming will not update past lessons
                    </p>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <input
                      type="number"
                      name="price"
                      form={`update-tier-${tier.id}`}
                      defaultValue={tier.price ?? ''}
                      step="0.01"
                      min="0"
                      className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                  </td>
                  <td className="py-3 pr-4 align-top text-sm">
                    {tier.is_active ? (
                      <span className="text-zinc-700 dark:text-zinc-300">Active</span>
                    ) : (
                      <span className="text-zinc-400 dark:text-zinc-500">Inactive</span>
                    )}
                    {error && errorTierId === tier.id && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                        Cannot deactivate the default tier
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <button
                      type="submit"
                      form={`update-tier-${tier.id}`}
                      className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      Save
                    </button>
                  </td>
                  <td className="py-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {tier.is_active && !tier.is_default && (
                        <form action={setDefaultTierAction.bind(null, slug, tier.id)}>
                          <button
                            type="submit"
                            className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            Set default
                          </button>
                        </form>
                      )}
                      {tier.is_active && (
                        <form action={deactivateTierAction.bind(null, slug, tier.id)}>
                          <button
                            type="submit"
                            className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            Deactivate
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No tiers yet.</p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Add Tier
        </h2>
        <form action={createTierAction.bind(null, slug)} className="flex items-end gap-4">
          <div>
            <label
              htmlFor="new-tier-name"
              className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Name
            </label>
            <input
              id="new-tier-name"
              type="text"
              name="name"
              required
              className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <div>
            <label
              htmlFor="new-tier-price"
              className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Price
            </label>
            <input
              id="new-tier-price"
              type="number"
              name="price"
              step="0.01"
              min="0"
              className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add tier
          </button>
        </form>
      </section>
    </main>
  )
}
