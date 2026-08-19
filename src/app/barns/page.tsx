import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { Card } from '@/components/ui/Card'

function capitalizeRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export default async function BarnsPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const memberships = await getBarnMembershipsForUser(user.id)
  if (memberships.length === 0) redirect('/login?no_barns=true')

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Select a Barn
      </h1>
      <ul className="space-y-4">
        {memberships.map(({ barn, membership }) => (
          <li key={membership.id}>
            <Card href={`/barn/${barn.slug}`} className="px-6 py-4">
              <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {barn.name}
              </span>
              <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
                {capitalizeRole(membership.role)}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  )
}
