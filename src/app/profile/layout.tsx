import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import { getNotifications } from '@/lib/db/notifications'
import { UserMenu } from '@/app/barn/[slug]/(protected)/UserMenu'
import { NotificationBell } from '@/app/barn/[slug]/(protected)/NotificationBell'
import { NavDrawer } from '@/app/barn/[slug]/(protected)/NavDrawer'
import { DesktopNavLinks } from '@/app/barn/[slug]/(protected)/DesktopNavLinks'
import { buildNavLinks } from '@/app/barn/[slug]/(protected)/nav-links'

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const headersList = await headers()
  const rawUrl = headersList.get('x-url') ?? ''
  const barnSlug = rawUrl ? new URL(rawUrl).searchParams.get('barn') : null

  if (barnSlug) {
    const barn = await getBarnBySlug(barnSlug)
    if (barn) {
      const membership = await getUserMembership(user.id, barn.id)
      if (membership?.status === 'active') {
        const [allMemberships, profileRows, notifications] = await Promise.all([
          getBarnMembershipsForUser(user.id),
          getProfilesByUserIds([user.id]),
          getNotifications(user.id, barn.id),
        ])
        const profile = profileRows[0] ?? null
        const initials =
          profile?.first_name && profile?.last_name
            ? `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase()
            : (user.email?.[0] ?? '?').toUpperCase()
        const fullName = profile ? `${profile.first_name} ${profile.last_name}` : null
        const showSwitchBarn =
          allMemberships.filter((m) => m.membership.status === 'active').length > 1

        const navLinks = buildNavLinks(barnSlug, membership.role)

        return (
          <>
            <nav className="flex items-center gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <NavDrawer navLinks={navLinks} />
              <Link
                href={`/barn/${barnSlug}`}
                className="text-sm font-semibold text-zinc-900 hover:text-zinc-600 dark:text-zinc-50 dark:hover:text-zinc-300"
              >
                {barn.name}
              </Link>
              <DesktopNavLinks navLinks={navLinks} />
              <div className="ml-auto flex items-center gap-2">
                <UserMenu
                  initials={initials}
                  email={user.email ?? ''}
                  fullName={fullName}
                  showSwitchBarn={showSwitchBarn}
                  barnSlug={barnSlug}
                />
                <NotificationBell notifications={notifications} barnSlug={barnSlug} />
              </div>
            </nav>
            {children}
          </>
        )
      }
    }
  }

  const memberships = await getBarnMembershipsForUser(user.id)
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
