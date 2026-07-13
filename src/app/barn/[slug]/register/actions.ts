'use server'

import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { claimManagedMember } from '@/lib/db/barn-memberships'

// Manual auth check, not requireMembership: the caller has no barn
// membership yet — claiming one is the whole point of this action.
export async function acceptInvite(slug: string, token: string): Promise<void> {
  const user = await getAuthenticatedUser()
  if (!user) {
    redirect(`/barn/${slug}/login?token=${encodeURIComponent(token)}`)
  }

  try {
    await claimManagedMember(token, user.id, user.email ?? null)
  } catch {
    redirect(`/barn/${slug}/register?token=${encodeURIComponent(token)}&error=1`)
  }

  redirect(`/barn/${slug}/`)
}
