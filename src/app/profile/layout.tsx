import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const memberships = await getBarnMembershipsForUser(data.user.id)
  const active = memberships.filter((m) => m.membership.status === 'active')
  const backHref = active.length === 1 ? `/barn/${active[0].barn.slug}` : '/barns'

  return (
    <>
      <nav className="flex items-center border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link
          href={backHref}
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300 active:text-zinc-500"
        >
          ← Back
        </Link>
      </nav>
      {children}
    </>
  )
}
