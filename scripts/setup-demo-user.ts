import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { upsertProfile, updateContactInfo, markProfileAsDemo } from '@/lib/db/profiles'
import { createServiceClient, findAuthUserIdsByEmails } from './script-utils'

// Email/password provider must be enabled in the Supabase dashboard:
// Authentication → Providers → Email (one-time manual step per project, including prod).
export const DEMO_EMAIL = 'demo@stable-state.app'

export function formatDemoCredentialsOutput(email: string, password: string): string {
  return `DEMO_USER_EMAIL=${email}\nDEMO_USER_PASSWORD=${password}`
}

/**
 * `.env.example`'s own placeholder convention, as a value this script must not treat as a
 * credential (#1619). Anchored, unlike the substring match `run-checklist-suite.sh`'s required-var
 * loop uses on the same convention, and the asymmetry is the consumer's rather than arbitrary: a
 * demo password is user-chosen and may legitimately contain an angle bracket mid-string, while
 * that loop's values (a project URL, two JWTs, a hex string) cannot — and one of them,
 * `NEXT_PUBLIC_SUPABASE_URL`, carries its placeholder embedded in a larger value
 * (`https://<your-project-ref>.supabase.co`) rather than whole-value, which only a substring
 * match can see.
 */
const ENV_EXAMPLE_PLACEHOLDER = /^<.*>$/

/**
 * The credential this run should use: whatever is already configured, or a fresh one when nothing
 * is (#1607). Extracted so the choice is assertable — it is the whole of what makes this script
 * safe to re-run, and before #1607 the unconditional mint made every re-run rotate the password
 * out from under `.env.local` and any deployment reading it.
 *
 * A `.env.example` placeholder counts as *nothing configured* (#1619). Until that issue the file
 * shipped `DEMO_USER_PASSWORD=<demo-user-password>`, and #1607's reuse turned it into a live
 * credential: a developer who copied the file and filled in only the other lines set the shared
 * demo user's real password to a literal string committed to this repo, with nothing to signal it
 * — `formatDemoCredentialsOutput` prints the value back byte-identical to the line already in
 * their `.env.local`. Routing it through the branch that already exists for empty makes the run
 * mint, print, and self-heal.
 *
 * It deliberately **does not throw**, which is where this parts company with `assertDevProject`'s
 * refuse-to-run precedent. Since #1607 this script runs on every `reset-db.sh`, so a throw here
 * would hard-stop an unrelated workflow for anyone still holding a stale `.env.local` — turning a
 * self-healing nuisance into a broken reset. There is a real credential to mint, so there is no
 * reason to halt; `run-checklist-suite.sh`'s loop halts on the same convention only because it has
 * nothing to mint.
 */
export function resolveDemoPassword(configured: string | undefined): string {
  return configured && configured.length > 0 && !ENV_EXAMPLE_PLACEHOLDER.test(configured)
    ? configured
    : randomUUID()
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
  // #1641: what `claim_managed_member` checks to refuse binding a real barn's invite stub to the
  // shared demo account. Set here so a fresh project is correct from the start; prod's already-
  // minted demo user is flagged by `createOrResumeDemoBarn` instead, since re-running this
  // script against prod would rotate a credential Vercel holds.
  await markProfileAsDemo(profile.id, supabase)

  console.log(formatDemoCredentialsOutput(DEMO_EMAIL, password))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('setup-demo-user failed:', err.message)
    process.exit(1)
  })
}
