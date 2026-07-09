// Email/password provider must be enabled in the Supabase dashboard:
// Authentication → Providers → Email (one-time manual step per project).
//
// Test user emails follow the pattern: <role>@<barn-slug>.e2e
// Password for all test users: TestPass123!

import { fileURLToPath } from 'url'
import { type SupabaseClient } from '@supabase/supabase-js'
import { mustSucceed, createServiceClient, teardownBarnData, findAuthUserIdsByEmails, assertDevProject } from './script-utils'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BARN_SLUG = process.env.TEST_BARN_SLUG

export const TEST_ROLES = ['manager', 'trainer', 'rider', 'rider2'] as const

export async function teardown(barnSlug: string, supabase: SupabaseClient): Promise<void> {
  const { data: barn } = await supabase.from('barns').select('id').eq('slug', barnSlug).maybeSingle()

  if (barn) {
    await teardownBarnData(barn.id, supabase)
    mustSucceed(await supabase.from('barns').delete().eq('id', barn.id), 'delete barn')
  }

  // Always clean up auth users — runs even when no barn exists (handles partial seed failures)
  const testEmails = TEST_ROLES.map((role) => `${role}@${barnSlug}.e2e`)
  const userIds = await findAuthUserIdsByEmails(testEmails, supabase)
  for (const userId of userIds) {
    await supabase.from('profiles').delete().eq('user_id', userId)
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) throw new Error(`delete auth user ${userId}: ${error.message}`)
  }
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!BARN_SLUG) throw new Error('TEST_BARN_SLUG is required')
  assertDevProject(SUPABASE_URL)

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  console.log(`Tearing down test barn: ${BARN_SLUG}…`)
  await teardown(BARN_SLUG, supabase)
  console.log('Done.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('teardown-test-barn failed:', err.message)
    process.exit(1)
  })
}
