import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getUserMembership, getBarnMembershipsForUser, applyPreAuthProfile } from '@/lib/db/barn-memberships'
import { getBarnBySlug } from '@/lib/db/barns'
import { getProfileByUserId } from '@/lib/db/profiles'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const barnSlug = searchParams.get('barn')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = await getAuthenticatedUser()
      if (user?.email) {
        await applyPreAuthProfile(user.id, user.email)
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
            if (!profile?.phone || !profile?.emergency_contact_name || !profile?.emergency_contact_phone) {
              const response = NextResponse.redirect(`${origin}/profile/complete`)
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
          if (!profile?.phone || !profile?.emergency_contact_name || !profile?.emergency_contact_phone) {
            const response = NextResponse.redirect(`${origin}/profile/complete`)
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
