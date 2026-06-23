import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import {
  getPendingMemberships,
  getActiveMemberships,
} from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import {
  createTierAction,
  updateTierAction,
  setDefaultTierAction,
  deactivateTierAction,
} from './actions'
import {
  approveMembershipAction,
  rejectMembershipAction,
  removeMembershipAction,
} from '../approvals/actions'
import { DeactivateButton } from './DeactivateButton'
import InviteLink from './InviteLink'
import type { BarnMembership, Profile } from '@/lib/db/types'

function profileName(profiles: Profile[], userId: string): string {
  const p = profiles.find((p) => p.user_id === userId)
  return p ? `${p.first_name} ${p.last_name}` : 'Unknown'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function MemberRow({
  membership,
  name,
  actionSlot,
}: {
  membership: BarnMembership
  name: string
  actionSlot: React.ReactNode
}) {
  return (
    <tr className="border-b border-zinc-100 dark:border-zinc-800">
      <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">{name}</td>
      <td className="py-3 pr-6 text-sm capitalize text-zinc-500 dark:text-zinc-400">
        {membership.role}
      </td>
      <td className="py-3 pr-6 text-sm text-zinc-500 dark:text-zinc-400">
        {formatDate(membership.created_at)}
      </td>
      <td className="py-3 text-sm">{actionSlot}</td>
    </tr>
  )
}

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

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const actorMembership = await getUserMembership(user.id, barn.id)

  if (
    !actorMembership ||
    actorMembership.status !== 'active' ||
    actorMembership.role !== 'manager'
  ) {
    redirect(`/barn/${slug}/login`)
  }

  const { error, errorTierId } = await searchParams
  const [tiers, pending, active] = await Promise.all([
    getAllTiersByBarn(barn.id),
    getPendingMemberships(barn.id),
    getActiveMemberships(barn.id),
  ])

  const removable = active.filter((m) => m.user_id !== user!.id)

  const allUserIds = [...new Set([...pending, ...active].map((m) => m.user_id))]
  const profiles = await getProfilesByUserIds(allUserIds)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Manage Barn
      </h1>

      <InviteLink slug={slug} />

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Pending Requests
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No pending requests.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Name</th>
                <th className="pb-2 pr-6">Role</th>
                <th className="pb-2 pr-6">Requested</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((m) => (
                <MemberRow
                  key={m.id}
                  membership={m}
                  name={profileName(profiles, m.user_id)}
                  actionSlot={
                    <div className="flex gap-2">
                      <form action={approveMembershipAction.bind(null, slug, m.id)}>
                        <button
                          type="submit"
                          className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          Approve
                        </button>
                      </form>
                      <form action={rejectMembershipAction.bind(null, slug, m.id)}>
                        <button
                          type="submit"
                          className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Active Members
        </h2>
        {removable.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No active members.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <th className="pb-2 pr-6">Name</th>
                <th className="pb-2 pr-6">Role</th>
                <th className="pb-2 pr-6">Since</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {removable.map((m) => (
                <MemberRow
                  key={m.id}
                  membership={m}
                  name={profileName(profiles, m.user_id)}
                  actionSlot={
                    <form action={removeMembershipAction.bind(null, slug, m.id)}>
                      <button
                        type="submit"
                        className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                      >
                        Remove
                      </button>
                    </form>
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* <form> cannot be a valid child of <tr>, so save forms live here and
          are associated to their row controls via the HTML `form` attribute. */}
      {tiers.filter((t) => t.is_active).map((tier) => (
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
                      form={tier.is_active ? `update-tier-${tier.id}` : undefined}
                      defaultValue={tier.name}
                      required
                      disabled={!tier.is_active}
                      className="rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
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
                      form={tier.is_active ? `update-tier-${tier.id}` : undefined}
                      defaultValue={tier.price ?? ''}
                      step="0.01"
                      min="0"
                      disabled={!tier.is_active}
                      className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
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
                    {tier.is_active && (
                      <button
                        type="submit"
                        form={`update-tier-${tier.id}`}
                        className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        Save
                      </button>
                    )}
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
                        <DeactivateButton action={deactivateTierAction.bind(null, slug, tier.id)} />
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
