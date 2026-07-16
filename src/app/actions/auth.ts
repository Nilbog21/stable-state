'use server'

import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// This file's actions are the auth entry/exit points themselves — no barn
// membership exists yet (sign-in) or matters anymore (sign-out) when they
// run, so requireMembership doesn't apply here.

async function getOrigin(): Promise<string> {
  const h = await headers()
  const proto = h.get('x-forwarded-proto')?.split(',')[0].trim() ?? 'http'
  const host = h.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

// remember_me survives the OAuth round-trip for the callback; remember_me_pref
// pre-fills the checkbox on the user's next visit.
async function setRememberCookies(formData: FormData) {
  const val = formData.get('remember') ? '1' : '0'
  const store = await cookies()
  store.set('remember_me', val, {
    maxAge: 300,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  store.set('remember_me_pref', val, {
    maxAge: 31536000,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
}

export async function signInWithGoogle(formData: FormData) {
  await setRememberCookies(formData)
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${await getOrigin()}/auth/callback`,
    },
  })

  if (error || !data.url) {
    redirect('/login?error=oauth_failed')
  }

  redirect(data.url)
}

export async function signInWithGoogleForBarn(
  barnSlug: string,
  inviteToken: string | undefined,
  formData: FormData
) {
  if (!/^[a-z0-9-]+$/.test(barnSlug)) {
    redirect('/login?error=invalid_barn')
  }

  await setRememberCookies(formData)
  const supabase = await createClient()
  const tokenParam = inviteToken ? `&token=${encodeURIComponent(inviteToken)}` : ''
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${await getOrigin()}/auth/callback?barn=${barnSlug}${tokenParam}`,
    },
  })

  if (error || !data.url) {
    redirect(`/barn/${barnSlug}/login?error=oauth_failed`)
  }

  redirect(data.url)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
