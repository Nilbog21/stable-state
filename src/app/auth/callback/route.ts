import { createClient } from '@/lib/supabase/server'
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
      const { data } = await supabase.auth.getUser()
      if (data?.user?.email) {
        await applyPreAuthProfile(data.user.id, data.user.email)
      }

      if (barnSlug) {
        const barn = await getBarnBySlug(barnSlug)
        if (!barn) {
          return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
        }

        const membership = data?.user
          ? await getUserMembership(data.user.id, barn.id)
          : null

        if (!membership) {
          return NextResponse.redirect(`${origin}/barn/${barnSlug}/register`)
        }

        if (membership.status === 'pending') {
          return NextResponse.redirect(`${origin}/barn/${barnSlug}/pending`)
        }

        const response = NextResponse.redirect(`${origin}/barn/${barnSlug}/`)
        response.cookies.set(`barn_session_${barnSlug}`, data.user!.id, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: `/barn/${barnSlug}/`,
        })
        return response
      }

      const memberships = data?.user
        ? await getBarnMembershipsForUser(data.user.id)
        : []

      const active = memberships.filter(m => m.membership.status === 'active')
      const pending = memberships.filter(m => m.membership.status === 'pending')

      if (active.length >= 1 && data?.user) {
        const profile = await getProfileByUserId(data.user.id)
        if (!profile?.phone || !profile?.emergency_contact_name || !profile?.emergency_contact_phone) {
          return NextResponse.redirect(`${origin}/profile/complete`)
        }
      }

      if (active.length === 1) {
        const slug = active[0].barn.slug
        const response = NextResponse.redirect(`${origin}/barn/${slug}`)
        response.cookies.set(`barn_session_${slug}`, data.user!.id, {
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
          response.cookies.set(`barn_session_${barn.slug}`, data.user!.id, {
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
