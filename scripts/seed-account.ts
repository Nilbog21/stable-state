import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { getBarnBySlug } from '@/lib/db/barns'
import { mustSucceed, createServiceClient } from './script-utils'

export function buildInvitePath(slug: string, token: string): string {
  return `/barn/${slug}/login?token=${token}`
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const firstName = process.env.SEED_FIRST_NAME
  const lastName = process.env.SEED_LAST_NAME
  const barnSlug = process.env.SEED_BARN_SLUG

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!firstName) throw new Error('SEED_FIRST_NAME is required')
  if (!lastName) throw new Error('SEED_LAST_NAME is required')
  if (!barnSlug) throw new Error('SEED_BARN_SLUG is required')

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const barn = await getBarnBySlug(barnSlug, supabase)
  if (!barn) throw new Error(`Barn slug not found: "${barnSlug}"`)

  // Direct inserts, not the create_managed_member RPC: its auth_is_barn_manager
  // check fails for service-role callers (auth.uid() is null).
  const profile = mustSucceed<{ id: string }>(
    await supabase
      .from('profiles')
      .insert({ first_name: firstName, last_name: lastName, is_managed: true })
      .select('id')
      .single(),
    'insert stub profile'
  )

  const inviteToken = randomUUID()
  mustSucceed(
    await supabase.from('barn_memberships').insert({
      barn_id: barn.id,
      profile_id: profile.id,
      role: 'manager',
      status: 'active',
      can_instruct: false,
      invite_token: inviteToken,
    }),
    'insert stub membership'
  )

  console.log(`\nCreated managed manager stub ${firstName} ${lastName} for barn "${barnSlug}".`)
  console.log(`Invite path: ${buildInvitePath(barnSlug, inviteToken)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('seed-account failed:', err.message)
    process.exit(1)
  })
}
