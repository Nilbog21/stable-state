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

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const password = randomUUID()

  // ponytail: findAuthUserIdsByEmails paginates auth.admin.listUsers 50-at-a-time —
  // fine for a one-time bootstrap script, revisit with a direct email filter if prod's
  // user count ever makes this scan noticeably slow.
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
