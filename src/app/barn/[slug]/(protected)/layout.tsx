import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import { getNotifications } from '@/lib/db/notifications'
import { UserMenu } from './UserMenu'
import { BarnSwitcher } from './BarnSwitcher'
import { NotificationBell } from './NotificationBell'
import { NavigationBlockerProvider, NavigationConfirmDialog } from './NavigationBlocker'
import { NavDrawer } from './NavDrawer'
import { DesktopNavLinks } from './DesktopNavLinks'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()
  return { title: `${barn.name} | Stable State` }
}

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

  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${slug}/login`)

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership) redirect(`/barn/${slug}/login`)
  if (membership.status === 'pending') redirect(`/barn/${slug}/pending`)
  if (membership.status !== 'active') redirect(`/barn/${slug}/login`)

  const [allMemberships, profileRows, notifications] = await Promise.all([
    getBarnMembershipsForUser(user.id),
    getProfilesByUserIds([user.id]),
    getNotifications(user.id, barn.id),
  ])
  const profile = profileRows[0] ?? null
  const initials =
    profile && profile.first_name && profile.last_name
      ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
      : (user.email?.[0] ?? '?').toUpperCase()
  const fullName = profile ? `${profile.first_name} ${profile.last_name}` : null
  const activeMemberships = allMemberships.filter((m) => m.membership.status === 'active')
  const activeBarnMemberships = activeMemberships.map((m) => ({ slug: m.barn.slug, name: m.barn.name }))
  const email = user.email ?? ''

  let navLinks: { href: string; label: string }[]
  if (membership.role === 'manager') {
    navLinks = [
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/expenses`, label: 'Expenses' },
      { href: `/barn/${slug}/horses`, label: 'Horses' },
      { href: `/barn/${slug}/agreements?kind=lease`, label: 'Leases' },
      { href: `/barn/${slug}/agreements?kind=board`, label: 'Boarding' },
      { href: `/barn/${slug}/members`, label: 'Members' },
      { href: `/barn/${slug}/finances`, label: 'Finances' },
      { href: `/barn/${slug}/settings`, label: 'Manage Barn' },
      { href: `/barn/${slug}/guide`, label: 'Guide' },
    ]
  } else if (membership.role === 'trainer') {
    navLinks = [
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/horses`, label: 'Horses' },
      { href: `/barn/${slug}/members`, label: 'Members' },
      { href: `/barn/${slug}/guide`, label: 'Guide' },
    ]
  } else {
    navLinks = [
      { href: `/barn/${slug}/lessons`, label: 'Lessons' },
      { href: `/barn/${slug}/horses`, label: 'Horses' },
      { href: `/barn/${slug}/members`, label: 'Members' },
      { href: `/barn/${slug}/guide`, label: 'Guide' },
    ]
  }

  return (
    <NavigationBlockerProvider>
      <nav className="flex items-center gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <NavDrawer navLinks={navLinks} />
        <BarnSwitcher
          barnName={barn.name}
          barnSlug={slug}
          activeBarnMemberships={activeBarnMemberships}
        />
        <DesktopNavLinks navLinks={navLinks} />
        <div className="ml-auto flex items-center gap-2">
          <span className="order-2 md:order-1">
            <UserMenu initials={initials} email={email} fullName={fullName} barnSlug={slug} />
          </span>
          <span className="order-1 md:order-2">
            <NotificationBell notifications={notifications} barnSlug={slug} />
          </span>
        </div>
      </nav>
      {children}
      <NavigationConfirmDialog />
    </NavigationBlockerProvider>
  )
}
