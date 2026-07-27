// The three long-lived auth logins the checklist e2e suite runs as. They are per *project*,
// not per barn — see E2E_USERS in e2e/support/fixtures.ts for why — so creating them is a
// one-time bootstrap rather than part of any seed.
//
// Modes:
//   create  — idempotent; reset-db.ts calls this after wiping the dev project
//   verify  — reports which are missing; seed-test-barn.ts calls this before seeding
//
// Email/password provider must be enabled in the Supabase dashboard:
// Authentication → Providers → Email (one-time manual step per project).

import { fileURLToPath } from 'url'
import { type SupabaseClient } from '@supabase/supabase-js'
import { upsertProfile } from '@/lib/db/profiles'
import { E2E_USERS, E2E_PASSWORD } from '../e2e/support/fixtures'
import { mustSucceed, createServiceClient, findAuthUserIdsByEmails, assertDevProject } from './script-utils'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MODE = process.env.E2E_AUTH_USERS_MODE

export function formatMissingUsersError(missing: string[]): string {
  return `e2e auth users missing (${missing.join(', ')}) — run: bash scripts/e2e-auth-users.sh create`
}

/** Returns the emails that have no auth user on this project. */
export async function verifyE2eAuthUsers(supabase: SupabaseClient): Promise<string[]> {
  const missing: string[] = []
  for (const user of Object.values(E2E_USERS)) {
    const [existing] = await findAuthUserIdsByEmails([user.email], supabase)
    if (!existing) missing.push(user.email)
  }
  return missing
}

/**
 * Idempotent: an existing login has its password reset rather than being recreated, so a
 * project seeded before the password was known still ends up usable.
 */
export async function createE2eAuthUsers(supabase: SupabaseClient): Promise<void> {
  for (const user of Object.values(E2E_USERS)) {
    const [existingId] = await findAuthUserIdsByEmails([user.email], supabase)

    let userId = existingId
    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password: E2E_PASSWORD })
      if (error) throw new Error(`reset password for ${user.email}: ${error.message}`)
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: E2E_PASSWORD,
        email_confirm: true,
      })
      if (error) throw new Error(`create ${user.email}: ${error.message}`)
      if (!data?.user) throw new Error(`create ${user.email}: no user returned`)
      userId = data.user.id
    }

    await upsertProfile(userId, user.email, user.firstName, user.lastName, supabase)
    // Contact fields filled in so the profile is complete — an incomplete profile redirects
    // to /profile/complete, which would derail every spec on its first navigation.
    mustSucceed(
      await supabase
        .from('profiles')
        .update({
          phone: '555-0100',
          emergency_contact_name: `${user.firstName} Emergency`,
          emergency_contact_phone: '555-0199',
        })
        .eq('user_id', userId),
      `update ${user.email} contact fields`
    )
  }
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (MODE !== 'create' && MODE !== 'verify') throw new Error('mode must be "create" or "verify"')
  if (process.env.E2E_AUTH_USERS_ALLOW_PROD !== 'true') assertDevProject(SUPABASE_URL)

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  if (MODE === 'verify') {
    const missing = await verifyE2eAuthUsers(supabase)
    if (missing.length > 0) throw new Error(formatMissingUsersError(missing))
    console.log(`All e2e auth users present: ${Object.values(E2E_USERS).map((u) => u.email).join(', ')}`)
    return
  }

  await createE2eAuthUsers(supabase)
  console.log('Done. e2e auth users ready:')
  for (const user of Object.values(E2E_USERS)) {
    console.log(`  ${user.role.padEnd(8)} ${user.email} / ${E2E_PASSWORD}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('e2e-auth-users failed:', err.message)
    process.exit(1)
  })
}
