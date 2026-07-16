import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import { getPendingMemberships } from '@/lib/db/barn-memberships'
import { resolveMemberNames } from '@/lib/db/member-names'
import { LocalDateTime, DATE_ONLY_OPTIONS } from '@/components/LocalDateTime'
import { approveMembershipAction, rejectMembershipAction } from '../approvals/actions'
import {
  updateDefaultBoardFeeAction,
  updateInstructorCutAction,
  updateExhaustionThresholdsAction,
  updateBarnTimezoneAction,
} from './actions'
import { BARN_TIMEZONES } from '@/lib/barn-timezone'
import { Button } from '@/components/ui/Button'
import { cardBaseClass } from '@/components/ui/Card'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { ExhaustionThresholdsForm } from './ExhaustionThresholdsForm'
import type { BarnMembership } from '@/lib/db/types'

function AccordionSection({
  title,
  defaultOpen = false,
  headerExtra,
  children,
}: {
  title: string
  defaultOpen?: boolean
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mb-6">
      <details open={defaultOpen} className={`relative ${cardBaseClass}`}>
        <summary
          className={`flex min-h-11 cursor-pointer items-center px-4 py-3 ${headerExtra ? 'pr-32' : ''}`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {title}
          </h2>
        </summary>
        {headerExtra && (
          <div className="absolute right-4 top-0 flex h-11 items-center">{headerExtra}</div>
        )}
        <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-700">{children}</div>
      </details>
    </div>
  )
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
      <Td tone="secondary">
        <LocalDateTime iso={membership.created_at} options={DATE_ONLY_OPTIONS} />
      </Td>
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

  const [tiers, pending] = await Promise.all([
    getAllTiersByBarn(barn.id),
    getPendingMemberships(barn.id),
  ])

  const nameMap = await resolveMemberNames(pending.map((m) => m.id), barn.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Manage Barn
      </h1>

      <AccordionSection title="Pending Requests" defaultOpen={pending.length > 0}>
        {pending.length === 0 ? (
          <EmptyState
            heading="No pending requests"
            subtext='From the Members page, add a member then share the link from "Copy Invite".'
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Requested</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((m) => (
                  <MemberRow
                    key={m.id}
                    membership={m}
                    name={nameMap.get(m.id) ?? m.id}
                    actionSlot={
                      <>
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
                      </>
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AccordionSection>

      <AccordionSection title="Default Instructor Cut">
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
      </AccordionSection>

      <AccordionSection title="Horse Exhaustion Thresholds">
        <ExhaustionThresholdsForm
          barn={barn}
          action={updateExhaustionThresholdsAction.bind(null, slug)}
        />
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Default exertion-sum thresholds used when a horse has no per-horse override.
        </p>
      </AccordionSection>

      <AccordionSection
        title="Lesson Tiers"
        headerExtra={<Button href={`/barn/${slug}/settings/tiers/new`}>Add Tier</Button>}
      >
        {tiers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Price</Th>
                  <Th>Default</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
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
      </AccordionSection>

      <AccordionSection title="Default Board Fee">
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
      </AccordionSection>

      <AccordionSection title="Barn Timezone">
        <form action={updateBarnTimezoneAction.bind(null, slug)} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="timezone" className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
              Timezone
            </label>
            <select
              id="timezone"
              name="timezone"
              defaultValue={barn.timezone}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            >
              {BARN_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit">Save</Button>
        </form>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Used to determine when scheduled expenses become past due and which month an expense falls into near month boundaries.
        </p>
      </AccordionSection>
    </main>
  )
}
