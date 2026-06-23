import type { FullConfig } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

async function globalSetup(_config: FullConfig) {
  const authDir = path.join(__dirname, '.auth')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  const barnSlug = process.env.TEST_BARN_SLUG
  if (!barnSlug) throw new Error('TEST_BARN_SLUG is required')
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const authCookieName = `sb-${projectRef}-auth-token`
  const domain = new URL(baseUrl).hostname

  fs.mkdirSync(authDir, { recursive: true })

  for (const role of ['manager', 'trainer', 'rider']) {
    const email = `${role}@${barnSlug}.e2e`

    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ email, password: 'TestPass123!' }),
    })
    if (!res.ok) throw new Error(`[global-setup] auth failed for ${role}: ${await res.text()}`)
    const session = await res.json()
    if (!session?.user?.id) throw new Error(`[global-setup] missing user.id in auth response for ${role}`)

    const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')

    const storageState = {
      cookies: [
        {
          name: authCookieName,
          value: encoded,
          domain,
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const,
        },
        {
          name: `barn_session_${barnSlug}`,
          value: session.user.id as string,
          domain,
          path: '/',
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ],
      origins: [],
    }

    fs.writeFileSync(
      path.join(authDir, `${role}.json`),
      JSON.stringify(storageState, null, 2),
    )
    console.log(`[global-setup] ${role}.json written`)
  }
}

export default globalSetup
