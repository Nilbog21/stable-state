import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'

export default async function BarnDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${slug}/login`)

  const membership =
    (await getUserMembership(data.user.id, barn.id)) ??
    (await getAdminMembership(data.user.id))

  if (!membership) redirect(`/barn/${slug}/login`)

  if (membership.status === 'pending') redirect(`/barn/${slug}/pending`)

  if (membership.status !== 'active') redirect(`/barn/${slug}/login`)

  const navLinks =
    membership.role === 'admin'
      ? [{ href: `/barn/${slug}/approvals`, label: 'Approvals' }]
      : [
          { href: `/barn/${slug}/lessons`, label: 'Lessons' },
          { href: `/barn/${slug}/riders`, label: 'Riders' },
        ]

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        {barn.name}
      </h1>
      <nav>
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-sm font-medium text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </main>
  )
}
