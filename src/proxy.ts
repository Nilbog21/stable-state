import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { applyRememberMe } from '@/lib/supabase/cookie-options'

const BARN_ROUTE = /^\/barn\/([^/]+)\//

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-url', request.url)
  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          const remember =
            request.cookies.get('remember_me')?.value ||
            request.cookies.get('remember_me_pref')?.value
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, applyRememberMe(options, value, remember))
          )
        },
      },
    }
  )

  const { data } = await supabase.auth.getUser()

  const { pathname } = new URL(request.url)
  const barnMatch = BARN_ROUTE.exec(pathname)

  if (barnMatch) {
    const barnSlug = barnMatch[1]

    const exemptPaths = [
      `/barn/${barnSlug}/login`,
      `/barn/${barnSlug}/register`,
      `/barn/${barnSlug}/pending`,
    ]
    if (exemptPaths.includes(pathname)) {
      return response
    }

    const userId = data?.user?.id
    const sessionCookie = request.cookies.get(`barn_session_${barnSlug}`)

    if (!sessionCookie || sessionCookie.value !== userId) {
      return NextResponse.redirect(new URL(`/barn/${barnSlug}/login`, request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
