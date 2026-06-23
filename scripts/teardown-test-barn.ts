// Email/password provider must be enabled in the Supabase dashboard:
// Authentication → Providers → Email (one-time manual step per project).
//
// Test user emails follow the pattern: <role>@<barn-slug>.e2e
// Password for all test users: TestPass123!

import { fileURLToPath } from 'url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BARN_SLUG = process.env.TEST_BARN_SLUG

const TEST_ROLES = ['manager', 'trainer', 'rider'] as const

function check({ error }: { error: unknown }, label: string): void {
  const err = error as { message?: string } | null
  if (err) throw new Error(`${label}: ${err.message}`)
}

export async function teardown(barnSlug: string, supabase: SupabaseClient): Promise<void> {
  const { data: barn } = await supabase.from('barns').select('id').eq('slug', barnSlug).maybeSingle()

  if (barn) {
    const barnId = barn.id
    check(await supabase.rpc('teardown_dev_barn_lessons', { p_barn_id: barnId }), 'teardown lessons')
    check(await supabase.from('lesson_tiers').delete().eq('barn_id', barnId), 'delete lesson_tiers')
    check(await supabase.from('notifications').delete().eq('barn_id', barnId), 'delete notifications')
    check(await supabase.from('riders').delete().eq('barn_id', barnId), 'delete riders')
    check(await supabase.from('horses').delete().eq('barn_id', barnId), 'delete horses')
    check(await supabase.from('barn_memberships').delete().eq('barn_id', barnId), 'delete barn_memberships')
    check(await supabase.from('barns').delete().eq('id', barnId), 'delete barn')
  }

  // Always clean up auth users — runs even when no barn exists (handles partial seed failures)
  const testEmails = TEST_ROLES.map((role) => `${role}@${barnSlug}.e2e`)
  let page = 1
  let hasMore = true
  while (hasMore) {
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
    if (listErr) throw new Error(`list auth users: ${listErr.message}`)
    if (!listData) break
    for (const user of listData.users) {
      if (user.email && testEmails.includes(user.email)) {
        await supabase.from('profiles').delete().eq('user_id', user.id)
        const { error } = await supabase.auth.admin.deleteUser(user.id)
        if (error) throw new Error(`delete auth user ${user.id}: ${error.message}`)
      }
    }
    hasMore = listData.users.length === 50
    page++
  }
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!BARN_SLUG) throw new Error('TEST_BARN_SLUG is required')

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

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
