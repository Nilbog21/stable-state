import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'

export default async function ProtectedBarnLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${slug}/login`)

  const membership = await getUserMembership(data.user.id, barn.id)
  if (!membership) redirect(`/barn/${slug}/login`)
  if (membership.status === 'pending') redirect(`/barn/${slug}/pending`)
  if (membership.status !== 'active') redirect(`/barn/${slug}/login`)

  let navLinks: { href: string; label: string }[]
  if (membership.role === 'manager') {
    navLinks = [
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/horses`, label: 'Horses' },
      { href: `/barn/${slug}/riders`, label: 'Riders' },
      { href: `/barn/${slug}/finances`, label: 'Finances' },
      { href: `/barn/${slug}/settings`, label: 'Manage Barn' },
    ]
  } else if (membership.role === 'trainer') {
    navLinks = [
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/horses`, label: 'Horses' },
      { href: `/barn/${slug}/riders`, label: 'Riders' },
    ]
  } else {
    navLinks = [
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/horses`, label: 'Horses' },
    ]
  }

  return (
    <>
      <nav className="flex gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link
          href={`/barn/${slug}`}
          className="text-sm font-semibold text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
        >
          {barn.name}
        </Link>
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
      {children}
    </>
  )
}
