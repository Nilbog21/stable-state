import { createClient } from '@/lib/supabase/server'
import { applySeededMembership, getUserMembership, getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { getBarnBySlug } from '@/lib/db/barns'
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
        await applySeededMembership(data.user.id, data.user.email)
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

      if (active.length === 1) {
        return NextResponse.redirect(`${origin}/barn/${active[0].barn.slug}`)
      }
      if (active.length > 1) {
        return NextResponse.redirect(`${origin}/barns`)
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
