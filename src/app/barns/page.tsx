import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'

function capitalizeRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export default async function BarnsPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const memberships = await getBarnMembershipsForUser(data.user.id)
  if (memberships.length === 0) redirect('/login?no_barns=true')

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Select a Barn
      </h1>
      <ul className="space-y-4">
        {memberships.map(({ barn, membership }) => {
          const isPending = membership.status === 'pending'
          const href = isPending ? `/barn/${barn.slug}/pending` : `/barn/${barn.slug}`
          return (
            <li key={membership.id}>
              <Link
                href={href}
                className="block rounded-lg border border-zinc-200 px-6 py-4 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  {barn.name}
                </span>
                {isPending ? (
                  <span className="ml-3 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    Pending Approval
                  </span>
                ) : (
                  <span className="ml-3 text-sm text-zinc-500 dark:text-zinc-400">
                    {capitalizeRole(membership.role)}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
