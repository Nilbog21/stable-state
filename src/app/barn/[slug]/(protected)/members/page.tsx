import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getProfileByUserId } from '@/lib/db/profiles'
import { EmptyState } from '@/components/EmptyState'
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

  let managers: { membershipId: string; userId: string | null; name: string; isManaged: boolean; inviteToken: string | null }[] = []
  let trainers: { membershipId: string; userId: string | null; name: string; isManaged: boolean; inviteToken: string | null }[] = []
  let riders: { membershipId: string; userId: string | null; name: string; isManaged: boolean; inviteToken: string | null }[] = []

  if (membership.role === 'manager') {
    ;[managers, trainers, riders] = await Promise.all([
      getActiveMembersWithProfiles(barn.id, 'manager'),
      getActiveMembersWithProfiles(barn.id, 'trainer'),
      getActiveMembersWithProfiles(barn.id, 'rider'),
    ])
    managers = managers.filter((m) => m.membershipId !== membership.id)
  } else if (membership.role === 'trainer') {
    riders = await getActiveMembersWithProfiles(barn.id, 'rider')
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Members
      </h1>

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          You
        </h2>
        <Link
          href={`/barn/${slug}/members/${membership.id}`}
          className="block rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          {youName}
        </Link>
      </section>

      {membership.role === 'manager' && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Managers
          </h2>
          {managers.length > 0 ? (
            <ul className="space-y-2">
              {managers.map((m) => (
                <li key={m.membershipId}>
                  <Link
                    href={`/barn/${slug}/members/${m.membershipId}`}
                    className="block rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                  >
                    {m.name}
                  </Link>
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
      )}

      {membership.role === 'manager' && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Trainers
          </h2>
          <form action={createManagedMemberAction.bind(null, slug, 'trainer')} className="mb-4 flex items-center gap-2">
            <input
              name="first_name"
              required
              placeholder="First name"
              className="min-h-[44px] rounded border border-zinc-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <input
              name="last_name"
              required
              placeholder="Last name"
              className="min-h-[44px] rounded border border-zinc-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="submit"
              className="flex min-h-[44px] items-center rounded bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add Trainer
            </button>
          </form>
          {trainers.length > 0 ? (
            <ul className="space-y-2">
              {trainers.map((t) =>
                t.isManaged && t.inviteToken ? (
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
                    <Link
                      href={`/barn/${slug}/members/${t.membershipId}`}
                      className="block rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                    >
                      {t.name}
                    </Link>
                  </li>
                )
              )}
            </ul>
          ) : (
            <EmptyState
              heading="No trainers yet"
              subtext="Trainers can request access using the invite link in Manage Barn."
            />
          )}
        </section>
      )}

      {(membership.role === 'manager' || membership.role === 'trainer') && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Riders
          </h2>
          {membership.role === 'manager' && (
            <form action={createManagedMemberAction.bind(null, slug, 'rider')} className="mb-4 flex items-center gap-2">
              <input
                name="first_name"
                required
                placeholder="First name"
                className="min-h-[44px] rounded border border-zinc-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <input
                name="last_name"
                required
                placeholder="Last name"
                className="min-h-[44px] rounded border border-zinc-200 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="flex min-h-[44px] items-center rounded bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Add Rider
              </button>
            </form>
          )}
          {riders.length > 0 ? (
            <ul className="space-y-2">
              {riders.map((r) =>
                r.isManaged && r.inviteToken ? (
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
                    <Link
                      href={`/barn/${slug}/members/${r.membershipId}`}
                      className="block rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                    >
                      {r.name}
                    </Link>
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
      )}
    </main>
  )
}
