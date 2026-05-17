import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const BARN_ROUTE = /^\/barn\/([^/]+)\//

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
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
