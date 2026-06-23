import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
import { TierRow } from './TierRow'
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

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${slug}/login`)

  const actorMembership = await getUserMembership(data.user.id, barn.id)

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

  const removable = active.filter((m) => m.user_id !== data.user!.id)

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
                <TierRow
                  key={tier.id}
                  tier={tier}
                  formId={`update-tier-${tier.id}`}
                  setDefaultAction={setDefaultTierAction.bind(null, slug, tier.id)}
                  deactivateAction={deactivateTierAction.bind(null, slug, tier.id)}
                  showError={!!(error && errorTierId === tier.id)}
                />
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
        <form action={createTierAction.bind(null, slug)} className="flex flex-wrap items-end gap-4">
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
          <div>
            <label
              htmlFor="new-tier-jumping"
              className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Jumping
            </label>
            <select
              id="new-tier-jumping"
              name="default_jumping"
              defaultValue=""
              className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">— no default</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="new-tier-exertion"
              className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Exertion
            </label>
            <select
              id="new-tier-exertion"
              name="default_exertion_level"
              defaultValue=""
              className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">— no default</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
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
