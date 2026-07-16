import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getUserMembership, getBarnMembershipsForUser, getActiveMemberships } from '@/lib/db/barn-memberships'
import { claimManagedMember } from '@/lib/db/member-invites'
import { getBarnBySlug } from '@/lib/db/barns'
import { getProfileByUserId, getProfilesByUserIds } from '@/lib/db/profiles'
import { createNotification, deleteNotificationByType } from '@/lib/db/notifications'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { REMEMBER_ME_MAX_AGE } from '@/lib/supabase/cookie-options'
import { isProfileIncomplete } from '@/lib/contact-info'
import type { Barn, BarnMembership, Profile } from '@/lib/db/types'

async function generateLoginNotifications(
  userId: string,
  activeMemberships: Array<{ barn: Barn; membership: BarnMembership }>,
  profile: Profile | null
): Promise<void> {
  const profileIncomplete = isProfileIncomplete(profile)

  await Promise.all(activeMemberships.map(async ({ barn, membership }) => {
    if (profileIncomplete) {
      await createNotification({
        userId,
        barnId: barn.id,
        type: 'incomplete_profile',
        title: 'Complete your profile',
        link: '/profile/complete',
      })
    } else {
      await deleteNotificationByType(userId, barn.id, 'incomplete_profile')
    }
    if (membership.role === 'manager') {
      const members = await getActiveMemberships(barn.id)
      const otherIds = members
        .map(m => m.user_id)
        .filter((uid): uid is string => uid !== null && uid !== userId)
      let hasIncomplete = false
      if (otherIds.length > 0) {
        const memberProfiles = await getProfilesByUserIds(otherIds)
        hasIncomplete = memberProfiles.some(p => isProfileIncomplete(p))
      }
      if (hasIncomplete) {
        await createNotification({
          userId,
          barnId: barn.id,
          type: 'member_incomplete_profile',
          title: 'Some barn members have incomplete profiles',
        })
      } else {
        await deleteNotificationByType(userId, barn.id, 'member_incomplete_profile')
      }
    }
  }))
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const barnSlug = searchParams.get('barn')
  const inviteToken = searchParams.get('token')
  const remember = request.cookies?.get('remember_me')?.value

  // remember_me is single-use: cleared on every normal return via redirect() below.
  // An unhandled throw skips this, but the cookie's own 5-minute TTL covers that case.
  const redirect = (url: string) => {
    const response = NextResponse.redirect(url)
    if (remember !== undefined) {
      response.cookies.set('remember_me', '', { maxAge: 0, path: '/' })
    }
    return response
  }

  const setBarnSession = (response: NextResponse, slug: string, userId: string) => {
    response.cookies.set(`barn_session_${slug}`, userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: `/barn/${slug}/`,
      ...(remember === '1' ? { maxAge: REMEMBER_ME_MAX_AGE } : {}),
    })
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = await getAuthenticatedUser()

      if (inviteToken && user) {
        try {
          await claimManagedMember(inviteToken, user.id, user.email ?? null)
        } catch {
          const base = barnSlug ? `${origin}/barn/${barnSlug}/login` : `${origin}/login`
          return redirect(`${base}?error=invite_claim_failed`)
        }
      }

      if (barnSlug) {
        const barn = await getBarnBySlug(barnSlug)
        if (!barn) {
          return redirect(`${origin}/login?error=auth_callback_failed`)
        }

        const membership = user
          ? await getUserMembership(user.id, barn.id)
          : null

        if (!membership) {
          return redirect(`${origin}/barn/${barnSlug}/register`)
        }

        if (membership.status === 'pending') {
          return redirect(`${origin}/barn/${barnSlug}/pending`)
        }

        if (user) {
          try {
            const profile = await getProfileByUserId(user.id)
            await generateLoginNotifications(user.id, [{ barn, membership }], profile).catch(() => {})
            if (isProfileIncomplete(profile)) {
              const response = redirect(`${origin}/profile/complete?barn=${barnSlug}`)
              setBarnSession(response, barnSlug, user.id)
              return response
            }
          } catch {
            // transient DB error — proceed to barn redirect
          }
        }

        const response = redirect(`${origin}/barn/${barnSlug}/`)
        setBarnSession(response, barnSlug, user!.id)
        return response
      }

      const memberships = user
        ? await getBarnMembershipsForUser(user.id)
        : []

      const active = memberships.filter(m => m.membership.status === 'active')
      const pending = memberships.filter(m => m.membership.status === 'pending')

      if (active.length >= 1 && user) {
        try {
          const profile = await getProfileByUserId(user.id)
          await generateLoginNotifications(user.id, active, profile).catch(() => {})
          if (isProfileIncomplete(profile)) {
            const barnParam = active.length === 1 ? `?barn=${active[0].barn.slug}` : ''
            const response = redirect(`${origin}/profile/complete${barnParam}`)
            for (const { barn } of active) {
              setBarnSession(response, barn.slug, user.id)
            }
            return response
          }
        } catch {
          // transient DB error — proceed to barn redirect
        }
      }

      if (active.length === 1) {
        const slug = active[0].barn.slug
        const response = redirect(`${origin}/barn/${slug}`)
        setBarnSession(response, slug, user!.id)
        return response
      }
      if (active.length > 1) {
        const response = redirect(`${origin}/barns`)
        for (const { barn } of active) {
          setBarnSession(response, barn.slug, user!.id)
        }
        return response
      }
      if (pending.length === 1) {
        return redirect(`${origin}/barn/${pending[0].barn.slug}/pending`)
      }
      if (pending.length > 1) {
        return redirect(`${origin}/barns`)
      }
      return redirect(`${origin}/login?no_barns=true`)
    }
  }

  return redirect(`${origin}/login?error=auth_callback_failed`)
}
