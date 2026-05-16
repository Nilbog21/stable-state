import { createClient } from '@/lib/supabase/server'
import { applySeededMembership, getUserMembership } from '@/lib/db/barn-memberships'
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
          return NextResponse.redirect(`${origin}/barn/${barnSlug}/login?error=access_denied`)
        }

        const response = NextResponse.redirect(`${origin}/barn/${barnSlug}/`)
        response.cookies.set(`barn_session_${barnSlug}`, data.user!.id, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
        })
        return response
      }

      return NextResponse.redirect(`${origin}/`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
