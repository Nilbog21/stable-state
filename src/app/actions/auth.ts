'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function getOrigin(): Promise<string> {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

export async function signInWithGoogle() {
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

export async function signInWithGoogleForBarn(barnSlug: string) {
  if (!/^[a-z0-9-]+$/.test(barnSlug)) {
    redirect('/login?error=invalid_barn')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${await getOrigin()}/auth/callback?barn=${barnSlug}`,
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
