'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { claimManagedMember } from '@/lib/db/member-invites'

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

  const cookieStore = await cookies()
  cookieStore.set(`barn_session_${slug}`, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/barn/${slug}/`,
  })

  redirect(`/barn/${slug}/`)
}
