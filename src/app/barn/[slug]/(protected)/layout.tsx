import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { DevRoleSwitcher } from '../DevRoleSwitcher'
import type { Role } from '@/lib/db/types'

const OVERRIDABLE_ROLES: Role[] = ['trainer', 'rider']

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

  const membership = await getEffectiveMembership(data.user.id, barn.id)
  if (!membership) redirect(`/barn/${slug}/login`)
  if (membership.status === 'pending') redirect(`/barn/${slug}/pending`)
  if (membership.status !== 'active') redirect(`/barn/${slug}/login`)

  let navLinks: { href: string; label: string }[]
  if (membership.role === 'manager') {
    navLinks = [
      { href: `/barn/${slug}`, label: 'Dashboard' },
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/horses`, label: 'Horses' },
      { href: `/barn/${slug}/riders`, label: 'Riders' },
      { href: `/barn/${slug}/finances`, label: 'Finances' },
      { href: `/barn/${slug}/approvals`, label: 'Approvals' },
      { href: `/barn/${slug}/settings`, label: 'Settings' },
    ]
  } else if (membership.role === 'trainer') {
    navLinks = [
      { href: `/barn/${slug}`, label: 'Dashboard' },
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/riders`, label: 'Riders' },
    ]
  } else {
    navLinks = [
      { href: `/barn/${slug}`, label: 'Dashboard' },
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
    ]
  }

  let showSwitcher = false
  let currentOverride: Role | null = null

  if (process.env.NODE_ENV === 'development') {
    const actualMembership = await getUserMembership(data.user.id, barn.id)
    if (actualMembership?.role === 'manager') {
      showSwitcher = true
      const cookieStore = await cookies()
      const override = cookieStore.get('dev_role_override')?.value as Role | undefined
      currentOverride = override && OVERRIDABLE_ROLES.includes(override) ? override : null
    }
  }

  return (
    <>
      <nav className="flex gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
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
      {showSwitcher && <DevRoleSwitcher currentOverride={currentOverride} />}
    </>
  )
}
