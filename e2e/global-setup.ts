import type { FullConfig } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { E2E_USERS, E2E_PASSWORD } from './support/fixtures'

async function globalSetup(_config: FullConfig) {
  const authDir = path.join(__dirname, '.auth')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const authCookieName = `sb-${projectRef}-auth-token`
  const domain = new URL(baseUrl).hostname

  fs.mkdirSync(authDir, { recursive: true })

  for (const user of Object.values(E2E_USERS)) {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ email: user.email, password: E2E_PASSWORD }),
    })
    if (!res.ok) {
      // The e2e logins are a one-time per-project bootstrap, not part of any barn seed, so
      // the fix is always to run that bootstrap — never to reseed a barn.
      throw new Error(
        `[global-setup] auth failed for ${user.email}: ${await res.text()}\n` +
          'If the login does not exist, create it with: bash scripts/e2e-auth-users.sh create ' +
          '(scripts/reset-db.sh does this too, on the dev project)'
      )
    }
    const session = await res.json()
    if (!session?.user?.id) throw new Error(`[global-setup] missing user.id in auth response for ${user.email}`)

    const encoded = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')

    // Auth token only. The barn_session_<slug> cookie can't live here — the slug isn't known
    // until a spec file's beforeAll seeds its own barn — so support/test.ts's page fixture
    // sets it per context instead.
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
      ],
      origins: [],
    }

    fs.writeFileSync(
      path.join(authDir, `${user.role}.json`),
      JSON.stringify(storageState, null, 2),
    )
    console.log(`[global-setup] ${user.role}.json written`)
  }
}

export default globalSetup
