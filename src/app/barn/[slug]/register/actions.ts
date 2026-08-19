'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { claimManagedMember, isDemoClaimRejection } from '@/lib/db/member-invites'

// Manual auth check, not requireMembership: the caller has no barn
// membership yet — claiming one is the whole point of this action.
export async function acceptInvite(slug: string, token: string): Promise<void> {
  const user = await getAuthenticatedUser()
  if (!user) {
    redirect(`/barn/${slug}/login?token=${encodeURIComponent(token)}`)
  }

  try {
    await claimManagedMember(token, user.id, user.email ?? null)
  } catch (error) {
    // #1641: back to the invite with the token intact and no `error`, so the page's own demo
    // branch renders. The `&error=1` screen says the invite is invalid or has expired, which is
    // exactly wrong here — the invite is fine, the session is the shared demo account. Reaching
    // this at all needs a forged or raced POST, since the page catches the demo case at render.
    if (isDemoClaimRejection(error)) {
      redirect(`/barn/${slug}/register?token=${encodeURIComponent(token)}`)
    }
    redirect(`/barn/${slug}/register?token=${encodeURIComponent(token)}&error=1`)
  }

  const cookieStore = await cookies()
  cookieStore.set(`barn_session_${slug}`, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: `/barn/${slug}`,
  })

  redirect(`/barn/${slug}/`)
}

// Manual auth handling for the same reason as above. `signOut` from `@/app/actions/auth` lands on
// `/login`, which strands a claimant who is signed in as the wrong account — they would have to
// find the emailed invite again. This returns them to the barn login with the token, so the
// journey continues (#1641).
export async function signOutAndReturnToInvite(slug: string, token: string): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(`/barn/${slug}/login?token=${encodeURIComponent(token)}`)
}
