import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import {
  getPendingMemberships,
  getActiveMemberships,
  resolveMemberNames,
} from '@/lib/db/barn-memberships'
import {
  approveMembershipAction,
  rejectMembershipAction,
  removeMembershipAction,
} from '../approvals/actions'
import {
  updateDefaultBoardFeeAction,
  updateInstructorCutAction,
  updateExhaustionThresholdsAction,
} from './actions'
import { Button } from '@/components/ui/Button'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/Badge'
import InviteLink from './InviteLink'
import { ExhaustionThresholdsForm } from './ExhaustionThresholdsForm'
import { RemoveMemberButton } from './RemoveMemberButton'
import type { BarnMembership } from '@/lib/db/types'

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
    <tr>
      <Td>{name}</Td>
      <Td tone="secondary" className="capitalize">
        {membership.role}
      </Td>
      <Td tone="secondary">{formatDate(membership.created_at)}</Td>
      <TableActions>{actionSlot}</TableActions>
    </tr>
  )
}

export default async function SettingsPage({
  params,
  searchParams: _searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string>>
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

  const [tiers, pending, active] = await Promise.all([
    getAllTiersByBarn(barn.id),
    getPendingMemberships(barn.id),
    getActiveMemberships(barn.id),
  ])

  const removable = active.filter((m) => m.user_id !== user!.id)

  const allMembershipIds = [...pending, ...active].map((m) => m.id)
  const nameMap = await resolveMemberNames(allMembershipIds, barn.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Manage Barn
      </h1>

      <InviteLink slug={slug} />

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Pending Requests
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            heading="No pending requests"
            subtext="Membership requests to join this barn will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Requested</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((m) => (
                  <MemberRow
                    key={m.id}
                    membership={m}
                    name={nameMap.get(m.id) ?? m.id}
                    actionSlot={
                      <div className="flex justify-end gap-2">
                        <form action={approveMembershipAction.bind(null, slug, m.id)}>
                          <Button type="submit" size="sm">
                            Approve
                          </Button>
                        </form>
                        <form action={rejectMembershipAction.bind(null, slug, m.id)}>
                          <Button type="submit" variant="ghost" size="sm">
                            Reject
                          </Button>
                        </form>
                      </div>
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Active Members
        </h2>
        {removable.length === 0 ? (
          <EmptyState heading="No active members" subtext="Approved barn members will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Since</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {removable.map((m) => {
                  const name = nameMap.get(m.id) ?? m.id
                  return (
                    <MemberRow
                      key={m.id}
                      membership={m}
                      name={name}
                      actionSlot={
                        <RemoveMemberButton
                          action={removeMembershipAction.bind(null, slug, m.id)}
                          name={name}
                        />
                      }
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Default Instructor Cut
        </h2>
        <form action={updateInstructorCutAction.bind(null, slug)} className="flex items-end gap-4">
          <div>
            <label
              htmlFor="instructor_cut"
              className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
            >
              Default per-lesson instructor cut ($)
            </label>
            <input
              type="number"
              id="instructor_cut"
              name="instructor_cut"
              min="0"
              step="0.01"
              required
              defaultValue={barn.default_instructor_cut}
              className="w-32 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <Button type="submit">Save</Button>
        </form>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Changing this doesn&apos;t affect past lessons — only new tiers and Custom lessons booked afterward.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Horse Exhaustion Thresholds
        </h2>
        <ExhaustionThresholdsForm
          barn={barn}
          action={updateExhaustionThresholdsAction.bind(null, slug)}
        />
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Default exertion-sum thresholds used when a horse has no per-horse override.
        </p>
      </section>

      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Lesson Tiers
          </h2>
          <Button href={`/barn/${slug}/settings/tiers/new`}>Add Tier</Button>
        </div>

        {tiers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Price</Th>
                  <Th>Default</Th>
                  <Th>Status</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id}>
                    <Td>{tier.name}</Td>
                    <Td tone="secondary">${tier.price}</Td>
                    <Td>{tier.is_default && <Badge tone="solid">Default</Badge>}</Td>
                    <Td>
                      {tier.is_active ? (
                        <span className="text-zinc-700 dark:text-zinc-300">Active</span>
                      ) : (
                        <span className="text-zinc-400 dark:text-zinc-500">Inactive</span>
                      )}
                    </Td>
                    <TableActions>
                      <Button href={`/barn/${slug}/settings/tiers/${tier.id}`} variant="ghost" size="sm">
                        Edit
                      </Button>
                    </TableActions>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            heading="No tiers yet"
            subtext="Lesson tiers you add will appear here."
            cta={{ label: 'Add Tier', href: `/barn/${slug}/settings/tiers/new` }}
          />
        )}
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Default Board Fee
        </h2>
        <form action={updateDefaultBoardFeeAction.bind(null, slug)} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="default_board_fee" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              Monthly fee ($)
            </label>
            <input
              id="default_board_fee"
              name="default_board_fee"
              type="number"
              step="0.01"
              min="0"
              defaultValue={barn.default_board_fee}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <Button type="submit">Save</Button>
        </form>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Applies to new boarding agreements only — existing boarders are unchanged.
        </p>
      </section>
    </main>
  )
}
