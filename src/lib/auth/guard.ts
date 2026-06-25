import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import type { Barn, BarnMembership, Role } from '@/lib/db/types'
import type { User } from '@supabase/supabase-js'

export async function requireMembership(
  barnSlug: string,
  allowedRoles: Role[]
): Promise<{ user: User; barn: Barn; membership: BarnMembership }> {
  const user = await getAuthenticatedUser()
  if (!user) redirect(`/barn/${barnSlug}/login`)

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) redirect(`/barn/${barnSlug}/login`)

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active' || !allowedRoles.includes(membership.role)) {
    redirect(`/barn/${barnSlug}/login`)
  }

  return { user, barn, membership }
}
