import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getProfileByUserId } from '@/lib/db/profiles'
import { EmptyState } from '@/components/EmptyState'

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

  let managers: { membershipId: string; userId: string; name: string }[] = []
  let trainers: { membershipId: string; userId: string; name: string }[] = []
  let riders: { membershipId: string; userId: string; name: string }[] = []

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
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No managers yet.</p>
          )}
        </section>
      )}

      {membership.role === 'manager' && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Trainers
          </h2>
          {trainers.length > 0 ? (
            <ul className="space-y-2">
              {trainers.map((t) => (
                <li key={t.membershipId}>
                  <Link
                    href={`/barn/${slug}/members/${t.membershipId}`}
                    className="block rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                  >
                    {t.name}
                  </Link>
                </li>
              ))}
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
          {riders.length > 0 ? (
            <ul className="space-y-2">
              {riders.map((r) => (
                <li key={r.membershipId}>
                  <Link
                    href={`/barn/${slug}/members/${r.membershipId}`}
                    className="block rounded-lg border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
                  >
                    {r.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              heading="No riders yet"
              subtext="Riders can request access using the invite link in Manage Barn."
            />
          )}
        </section>
      )}
    </main>
  )
}
