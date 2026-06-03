import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import { DevRoleSwitcher } from './DevRoleSwitcher'
import type { Role } from '@/lib/db/types'

const OVERRIDABLE_ROLES: Role[] = ['manager', 'trainer', 'rider']

export default async function BarnLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let showSwitcher = false
  let currentOverride: Role | null = null

  if (process.env.NODE_ENV === 'development') {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()

    if (data.user) {
      const barn = await getBarnBySlug(slug)
      const membership = barn
        ? (await getUserMembership(data.user.id, barn.id)) ??
          (await getAdminMembership(data.user.id))
        : await getAdminMembership(data.user.id)

      if (membership?.role === 'admin') {
        showSwitcher = true
        const cookieStore = await cookies()
        const override = cookieStore.get('dev_role_override')?.value as Role | undefined
        currentOverride = override && OVERRIDABLE_ROLES.includes(override) ? override : null
      }
    }
  }

  return (
    <>
      {children}
      {showSwitcher && <DevRoleSwitcher currentOverride={currentOverride} />}
    </>
  )
}
