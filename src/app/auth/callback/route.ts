import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getUserMembership, getBarnMembershipsForUser, getActiveMemberships, claimManagedMember } from '@/lib/db/barn-memberships'
import { activateSeededAccount } from '@/lib/db/seeded-accounts'
import { getBarnBySlug } from '@/lib/db/barns'
import { getProfileByUserId, getProfilesByUserIds } from '@/lib/db/profiles'
import { createNotification, deleteNotificationByType } from '@/lib/db/notifications'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Barn, BarnMembership, Profile } from '@/lib/db/types'

async function generateLoginNotifications(
  userId: string,
  activeMemberships: Array<{ barn: Barn; membership: BarnMembership }>,
  profile: Profile | null
): Promise<void> {
  const profileIncomplete = !profile?.phone || !profile?.emergency_contact_name || !profile?.emergency_contact_phone

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
        hasIncomplete = memberProfiles.some(
          p => !p.phone || !p.emergency_contact_name || !p.emergency_contact_phone
        )
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

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = await getAuthenticatedUser()

      if (inviteToken && user) {
        try {
          await claimManagedMember(inviteToken, user.id, user.email ?? '')
        } catch {
          return NextResponse.redirect(`${origin}/login?error=invite_claim_failed`)
        }
      }

      if (user?.email) {
        try {
          await activateSeededAccount(user.id, user.email)
        } catch {
          // transient DB error — activation will retry on next sign-in
        }
      }

      if (barnSlug) {
        const barn = await getBarnBySlug(barnSlug)
        if (!barn) {
          return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
        }

        const membership = user
          ? await getUserMembership(user.id, barn.id)
          : null

        if (!membership) {
          return NextResponse.redirect(`${origin}/barn/${barnSlug}/register`)
        }

        if (membership.status === 'pending') {
          return NextResponse.redirect(`${origin}/barn/${barnSlug}/pending`)
        }

        if (user) {
          try {
            const profile = await getProfileByUserId(user.id)
            await generateLoginNotifications(user.id, [{ barn, membership }], profile).catch(() => {})
            if (!profile?.phone || !profile?.emergency_contact_name || !profile?.emergency_contact_phone) {
              const response = NextResponse.redirect(`${origin}/profile/complete?barn=${barnSlug}`)
              response.cookies.set(`barn_session_${barnSlug}`, user.id, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: `/barn/${barnSlug}/`,
              })
              return response
            }
          } catch {
            // transient DB error — proceed to barn redirect
          }
        }

        const response = NextResponse.redirect(`${origin}/barn/${barnSlug}/`)
        response.cookies.set(`barn_session_${barnSlug}`, user!.id, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: `/barn/${barnSlug}/`,
        })
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
          if (!profile?.phone || !profile?.emergency_contact_name || !profile?.emergency_contact_phone) {
            const barnParam = active.length === 1 ? `?barn=${active[0].barn.slug}` : ''
            const response = NextResponse.redirect(`${origin}/profile/complete${barnParam}`)
            for (const { barn } of active) {
              response.cookies.set(`barn_session_${barn.slug}`, user.id, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                path: `/barn/${barn.slug}/`,
              })
            }
            return response
          }
        } catch {
          // transient DB error — proceed to barn redirect
        }
      }

      if (active.length === 1) {
        const slug = active[0].barn.slug
        const response = NextResponse.redirect(`${origin}/barn/${slug}`)
        response.cookies.set(`barn_session_${slug}`, user!.id, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: `/barn/${slug}/`,
        })
        return response
      }
      if (active.length > 1) {
        const response = NextResponse.redirect(`${origin}/barns`)
        for (const { barn } of active) {
          response.cookies.set(`barn_session_${barn.slug}`, user!.id, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: `/barn/${barn.slug}/`,
          })
        }
        return response
      }
      if (pending.length === 1) {
        return NextResponse.redirect(`${origin}/barn/${pending[0].barn.slug}/pending`)
      }
      if (pending.length > 1) {
        return NextResponse.redirect(`${origin}/barns`)
      }
      return NextResponse.redirect(`${origin}/login?no_barns=true`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
