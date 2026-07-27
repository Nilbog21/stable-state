// Barn data only. The e2e auth logins are per *project*, not per barn (see
// scripts/e2e-auth-users.ts), so nothing here touches auth users — deleting them would break
// every other barn on the project, including a concurrent suite run's.

import { fileURLToPath } from 'url'
import { type SupabaseClient } from '@supabase/supabase-js'
import { mustSucceed, createServiceClient, assertDevProject } from './script-utils'
import { teardownBarn } from '../e2e/support/fixtures'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BARN_SLUG = process.env.TEST_BARN_SLUG
const BARN_SLUG_PREFIX = process.env.TEARDOWN_PREFIX

export async function teardown(barnSlug: string, supabase: SupabaseClient): Promise<void> {
  await teardownBarn(supabase, barnSlug)
}

/**
 * Every test barn whose slug starts with `prefix`. run-checklist-suite.sh's exit trap uses
 * this rather than `--all` — one run must never delete a concurrent run's barns.
 */
export async function teardownTestBarnsByPrefix(supabase: SupabaseClient, prefix: string): Promise<string[]> {
  const barns = mustSucceed<{ slug: string }[]>(
    await supabase.from('barns').select('slug').eq('is_test_barn', true).like('slug', `${prefix}%`),
    'list test barns by prefix'
  )
  const slugs = barns.map((b) => b.slug)
  for (const slug of slugs) {
    await teardown(slug, supabase)
  }
  return slugs
}

export async function teardownAllTestBarns(supabase: SupabaseClient): Promise<string[]> {
  const barns = mustSucceed<{ slug: string }[]>(
    await supabase.from('barns').select('slug').eq('is_test_barn', true),
    'list test barns'
  )
  const slugs = barns.map((b) => b.slug)
  for (const slug of slugs) {
    await teardown(slug, supabase)
  }
  return slugs
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (process.env.TEARDOWN_TEST_BARN_ALLOW_PROD !== 'true') assertDevProject(SUPABASE_URL)

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  if (process.env.TEARDOWN_ALL === 'true') {
    console.log('Tearing down all test barns…')
    const slugs = await teardownAllTestBarns(supabase)
    console.log(slugs.length ? `Done. Removed: ${slugs.join(', ')}` : 'No test barns found.')
    return
  }

  if (BARN_SLUG_PREFIX) {
    console.log(`Tearing down test barns starting with "${BARN_SLUG_PREFIX}"…`)
    const slugs = await teardownTestBarnsByPrefix(supabase, BARN_SLUG_PREFIX)
    console.log(slugs.length ? `Done. Removed: ${slugs.join(', ')}` : 'No matching test barns found.')
    return
  }

  if (!BARN_SLUG) throw new Error('TEST_BARN_SLUG is required')
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
