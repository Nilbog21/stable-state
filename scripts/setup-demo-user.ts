import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { upsertProfile, updateContactInfo } from '@/lib/db/profiles'
import { createServiceClient, findAuthUserIdsByEmails } from './script-utils'

// Email/password provider must be enabled in the Supabase dashboard:
// Authentication → Providers → Email (one-time manual step per project, including prod).
export const DEMO_EMAIL = 'demo@stable-state.app'

export function formatDemoCredentialsOutput(email: string, password: string): string {
  return `DEMO_USER_EMAIL=${email}\nDEMO_USER_PASSWORD=${password}`
}

/**
 * The credential this run should use: whatever is already configured, or a fresh one when nothing
 * is (#1607). Extracted so the choice is assertable — it is the whole of what makes this script
 * safe to re-run, and before #1607 the unconditional mint made every re-run rotate the password
 * out from under `.env.local` and any deployment reading it.
 */
export function resolveDemoPassword(configured: string | undefined): string {
  return isUsableDemoPassword(configured) ? (configured as string) : randomUUID()
}

/**
 * Whether a configured value is a real secret rather than a leftover placeholder.
 *
 * `.env.example` ships `DEMO_USER_PASSWORD=<demo-user-password>`, so a developer who copies it and
 * fills in the rest would otherwise have this script set the demo user's password to a literal
 * string committed to the repo — and, because the printed line would match what is already in their
 * file, nothing would look wrong. Reusing the configured value is what made that reachable, so the
 * guard belongs with the reuse. A rejected value is treated exactly as an unset one: mint a fresh
 * secret and print it, which is the path that already tells the developer to paste it.
 */
function isUsableDemoPassword(value: string | undefined): value is string {
  if (!value) return false
  // Angle brackets are the placeholder convention in .env.example; whitespace means the parse
  // picked up something that was never a single value. Both are mistakes, not short passwords.
  if (/[<>\s]/.test(value)) return false
  // Long enough not to be a stub. `randomUUID()` is 36, and nothing this script mints is shorter.
  return value.length >= 12
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  // Reuses the configured password when there is one, and mints a fresh one only when there
  // isn't (#1607). Minting unconditionally made this script *idempotent about the user row and
  // not about the credential*: every run rotated the password and left whatever had been pasted
  // into `.env.local` — or set on Vercel — signing in with a stale one. That is why `reset-db.sh`
  // can now call this at all; re-creating the demo user with a password nothing else knows would
  // have left `/demo` redirecting to `?error=demo_unavailable` exactly as it did when the user
  // was missing, which is the failure that call exists to prevent. It also closes the prod
  // foot-gun `POST_RELEASE_TEST_CHECKLIST.md` warns about, where re-running this against an
  // already-configured project rotated the credential out from under the deployment.
  const password = resolveDemoPassword(process.env.DEMO_USER_PASSWORD)

  // ponytail: findAuthUserIdsByEmails paginates auth.admin.listUsers 50-at-a-time — fine for a
  // dev project's user count, revisit with a direct email filter if prod's ever makes this scan
  // noticeably slow. (The ceiling is the user count, not how often this runs: since #1607 it runs
  // on every `reset-db.sh`, not only at bootstrap.)
  const [existingUserId] = await findAuthUserIdsByEmails([DEMO_EMAIL], supabase)

  let userId: string
  if (existingUserId) {
    userId = existingUserId
    const { error } = await supabase.auth.admin.updateUserById(userId, { password })
    if (error) throw new Error(`reset demo user password: ${error.message}`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
    })
    if (error) throw new Error(`create demo user: ${error.message}`)
    if (!data?.user) throw new Error('create demo user: no user returned')
    userId = data.user.id
  }

  const profile = await upsertProfile(userId, DEMO_EMAIL, 'Demo', 'User', supabase)
  await updateContactInfo(
    profile.id,
    {
      phone: '555-0100',
      emergency_contact_name: 'Demo Emergency Contact',
      emergency_contact_phone: '555-0199',
    },
    supabase
  )

  console.log(formatDemoCredentialsOutput(DEMO_EMAIL, password))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('setup-demo-user failed:', err.message)
    process.exit(1)
  })
}
