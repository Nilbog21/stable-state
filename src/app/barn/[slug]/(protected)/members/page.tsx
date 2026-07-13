import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getProfileByUserId } from '@/lib/db/profiles'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ManagedMemberRow } from './ManagedMemberRow'
import { createManagedMemberAction } from './actions'

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active') redirect(`/barn/${slug}/login`)

  const profile = await getProfileByUserId(user.id)
  const youName = profile ? `${profile.first_name} ${profile.last_name}` : (user.email ?? 'You')

  let [managers, trainers, riders] = await Promise.all([
    getActiveMembersWithProfiles(barn.id, 'manager'),
    getActiveMembersWithProfiles(barn.id, 'trainer'),
    getActiveMembersWithProfiles(barn.id, 'rider'),
  ])
  managers = managers.filter((m) => m.membershipId !== membership.id)
  trainers = trainers.filter((m) => m.membershipId !== membership.id)
  riders = riders.filter((m) => m.membershipId !== membership.id)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Members
      </h1>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          You
        </h2>
        <Card
          href={`/barn/${slug}/members/${membership.id}`}
          className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-50"
        >
          {youName}
        </Card>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Managers
        </h2>
        {managers.length > 0 ? (
          <ul className="space-y-2">
            {managers.map((m) => (
              <li key={m.membershipId}>
                <Card
                  href={`/barn/${slug}/members/${m.membershipId}`}
                  className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-50"
                >
                  {m.name}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            heading="No managers yet"
            subtext="Other managers will appear here once they join."
          />
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Trainers
        </h2>
        {membership.role === 'manager' && (
          <form action={createManagedMemberAction.bind(null, slug, 'trainer')} className="mb-4 flex items-center gap-2">
            <input
              name="first_name"
              required
              placeholder="First name"
              className="min-h-11 rounded border border-zinc-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <input
              name="last_name"
              required
              placeholder="Last name"
              className="min-h-11 rounded border border-zinc-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <Button type="submit">Add Trainer</Button>
          </form>
        )}
        {trainers.length > 0 ? (
          <ul className="space-y-2">
            {trainers.map((t) =>
              t.isManaged && t.inviteToken && membership.role === 'manager' ? (
                <li key={t.membershipId}>
                  <ManagedMemberRow
                    name={t.name}
                    barnSlug={slug}
                    membershipId={t.membershipId}
                    inviteToken={t.inviteToken}
                  />
                </li>
              ) : (
                <li key={t.membershipId}>
                  <Card
                    href={`/barn/${slug}/members/${t.membershipId}`}
                    className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-50"
                  >
                    {t.name}
                  </Card>
                </li>
              )
            )}
          </ul>
        ) : (
          <EmptyState
            heading="No trainers yet"
            subtext="Add a trainer above, or share the invite link from Manage Barn."
          />
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Riders
        </h2>
        {membership.role === 'manager' && (
          <form action={createManagedMemberAction.bind(null, slug, 'rider')} className="mb-4 flex items-center gap-2">
            <input
              name="first_name"
              required
              placeholder="First name"
              className="min-h-11 rounded border border-zinc-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <input
              name="last_name"
              required
              placeholder="Last name"
              className="min-h-11 rounded border border-zinc-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <Button type="submit">Add Rider</Button>
          </form>
        )}
        {riders.length > 0 ? (
          <ul className="space-y-2">
            {riders.map((r) =>
              r.isManaged && r.inviteToken && membership.role === 'manager' ? (
                <li key={r.membershipId}>
                  <ManagedMemberRow
                    name={r.name}
                    barnSlug={slug}
                    membershipId={r.membershipId}
                    inviteToken={r.inviteToken}
                  />
                </li>
              ) : (
                <li key={r.membershipId}>
                  <Card
                    href={`/barn/${slug}/members/${r.membershipId}`}
                    className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-50"
                  >
                    {r.name}
                  </Card>
                </li>
              )
            )}
          </ul>
        ) : (
          <EmptyState
            heading="No riders yet"
            subtext={
              membership.role === 'manager'
                ? 'Add a rider above, or share the invite link from Manage Barn.'
                : 'Riders can request access using the invite link in Manage Barn.'
            }
          />
        )}
      </section>
    </main>
  )
}
