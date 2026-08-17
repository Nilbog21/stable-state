/**
 * Service-role utilities for scripts and `/demo` seeding, built directly on
 * `@supabase/supabase-js` with no request-scoped SSR fallback anywhere:
 * `createServiceClient` (no session persistence/refresh), the `mustSucceed` unwrap
 * helper, auth-admin lookups with a race-safe find-or-create
 * (`findAuthUserIdsByEmails`/`findOrCreateAuthUser` — a concurrent `/demo` request may
 * win the create race and is re-checked), and `teardownBarnData`/`teardownAllData`,
 * which delete rows and their backing storage objects (document files and photo paths)
 * — the one module that touches the `documents` bucket without going through
 * `document-storage.ts`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function mustSucceed<T>(result: { data: T | null; error: unknown }, label: string): T {
  const err = result.error as { message?: string } | null
  if (err) throw new Error(`${label}: ${err.message}`)
  return result.data as T
}

export function createServiceClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function findAuthUserIdsByEmails(emails: string[], supabase: SupabaseClient): Promise<string[]> {
  const emailSet = new Set(emails)
  const userIds: string[] = []
  let page = 1
  let hasMore = true
  while (hasMore) {
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
    if (listErr) throw new Error(`list auth users: ${listErr.message}`)
    if (!listData) break
    for (const user of listData.users) {
      if (user.email && emailSet.has(user.email)) userIds.push(user.id)
    }
    hasMore = listData.users.length === 50
    page++
  }
  return userIds
}

export async function findOrCreateAuthUser(email: string, client: SupabaseClient): Promise<string> {
  const [existingId] = await findAuthUserIdsByEmails([email], client)
  if (existingId) return existingId

  const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true })
  if (error) {
    // A concurrent /demo request can win the race to create this same shared fixture
    // identity between our lookup above and this createUser call — re-check before failing.
    const [raceWinnerId] = await findAuthUserIdsByEmails([email], client)
    if (raceWinnerId) return raceWinnerId
    throw new Error(`create auth user ${email}: ${error.message}`)
  }
  if (!data?.user) throw new Error(`create auth user ${email}: no user returned`)
  return data.user.id
}

async function removeDocumentStorage(
  table: string,
  query: { data: { storage_path: string }[] | null; error: unknown },
  supabase: SupabaseClient
): Promise<void> {
  const paths = (query.data ?? []).map((d) => d.storage_path)
  if (!paths.length) return
  const { error } = await supabase.storage.from('documents').remove(paths)
  if (error) throw new Error(`remove storage ${table}: ${(error as { message?: string }).message}`)
}

async function removePhotoPathStorage(
  table: string,
  query: { data: { photo_path: string | null }[] | null; error: unknown },
  supabase: SupabaseClient
): Promise<void> {
  const paths = (query.data ?? []).map((h) => h.photo_path).filter((p): p is string => !!p)
  if (!paths.length) return
  const { error } = await supabase.storage.from('documents').remove(paths)
  if (error) throw new Error(`remove storage ${table}: ${(error as { message?: string }).message}`)
}

export async function teardownBarnData(barnId: string, supabase: SupabaseClient): Promise<void> {
  mustSucceed(await supabase.rpc('teardown_dev_barn_lessons', { p_barn_id: barnId }), 'teardown lessons')
  mustSucceed(await supabase.from('lesson_tiers').delete().eq('barn_id', barnId), 'delete lesson_tiers')
  mustSucceed(await supabase.from('notifications').delete().eq('barn_id', barnId), 'delete notifications')
  for (const table of ['horse_documents', 'staff_documents', 'rider_documents']) {
    await removeDocumentStorage(table, await supabase.from(table).select('storage_path').eq('barn_id', barnId), supabase)
    mustSucceed(await supabase.from(table).delete().eq('barn_id', barnId), `delete ${table}`)
  }
  await removePhotoPathStorage('horses', await supabase.from('horses').select('photo_path').eq('barn_id', barnId), supabase)
  mustSucceed(await supabase.from('horses').delete().eq('barn_id', barnId), 'delete horses')

  const membershipProfileIds = mustSucceed(
    await supabase.from('barn_memberships').select('profile_id').eq('barn_id', barnId),
    'fetch membership profile ids'
  ).map((m: { profile_id: string }) => m.profile_id)

  mustSucceed(await supabase.from('barn_memberships').delete().eq('barn_id', barnId), 'delete barn_memberships')

  if (membershipProfileIds.length > 0) {
    // `user_id IS NULL`, not `is_managed = true` (#1282). Stubs are inserted with a null user_id
    // and `claim_managed_member` sets user_id and clears is_managed in the same UPDATE, so this
    // filter is strictly stronger than the flag: it survives a spec demoting a stub to reach the
    // claimed-member state and not restoring it. 43 rows had leaked that way by the time this was
    // found. One caveat since #1563: scripts/change-user.ts is a third writer of profiles.user_id
    // and nulls the developer's own claimed row for as long as they inhabit another member, so
    // "null means unclaimed stub" holds for every barn this function is actually pointed at
    // (demo barns via /demo and the reset cron, per-run e2e barns) but is not a whole-project
    // invariant. Don't widen a caller to a barn the developer holds a membership in.
    await removePhotoPathStorage(
      'profiles',
      await supabase.from('profiles').select('photo_path').is('user_id', null).in('id', membershipProfileIds),
      supabase
    )
    mustSucceed(
      await supabase.from('profiles').delete().is('user_id', null).in('id', membershipProfileIds),
      'delete stale managed-stub profiles'
    )
  }
}

export async function teardownAllData(supabase: SupabaseClient): Promise<void> {
  mustSucceed(await supabase.rpc('teardown_all_lesson_data'), 'teardown all lessons')
  mustSucceed(await supabase.from('lesson_tiers').delete().not('id', 'is', null), 'delete lesson_tiers')
  mustSucceed(await supabase.from('notifications').delete().not('id', 'is', null), 'delete notifications')
  for (const table of ['horse_documents', 'staff_documents', 'rider_documents']) {
    await removeDocumentStorage(table, await supabase.from(table).select('storage_path').not('id', 'is', null), supabase)
    mustSucceed(await supabase.from(table).delete().not('id', 'is', null), `delete ${table}`)
  }
  await removePhotoPathStorage('horses', await supabase.from('horses').select('photo_path').not('id', 'is', null), supabase)
  mustSucceed(await supabase.from('horses').delete().not('id', 'is', null), 'delete horses')
  mustSucceed(await supabase.from('barn_memberships').delete().not('id', 'is', null), 'delete barn_memberships')
  await removePhotoPathStorage('profiles', await supabase.from('profiles').select('photo_path').not('id', 'is', null), supabase)
  mustSucceed(await supabase.from('profiles').delete().not('id', 'is', null), 'delete profiles')
  mustSucceed(await supabase.from('barns').delete().not('id', 'is', null), 'delete barns')
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 })
    if (error) throw new Error(`list auth users: ${error.message}`)
    if (!data || data.users.length === 0) break
    for (const user of data.users) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(user.id)
      if (delErr) throw new Error(`delete auth user ${user.id}: ${delErr.message}`)
    }
  }
}
