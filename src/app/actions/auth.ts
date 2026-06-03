'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

async function getSiteUrl(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get('host')
  if (!host) return 'http://localhost:3000'
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}

export async function signInWithGoogle() {
  const supabase = await createClient()
  const siteUrl = await getSiteUrl()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl}/auth/callback`,
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
  const siteUrl = await getSiteUrl()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl}/auth/callback?barn=${barnSlug}`,
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
