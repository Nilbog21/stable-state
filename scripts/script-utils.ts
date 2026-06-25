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

export async function teardownBarnData(barnId: string, supabase: SupabaseClient): Promise<void> {
  mustSucceed(await supabase.rpc('teardown_dev_barn_lessons', { p_barn_id: barnId }), 'teardown lessons')
  mustSucceed(await supabase.from('lesson_tiers').delete().eq('barn_id', barnId), 'delete lesson_tiers')
  mustSucceed(await supabase.from('notifications').delete().eq('barn_id', barnId), 'delete notifications')
  for (const table of ['horse_documents', 'trainer_documents', 'rider_documents']) {
    await removeDocumentStorage(table, await supabase.from(table).select('storage_path').eq('barn_id', barnId), supabase)
    mustSucceed(await supabase.from(table).delete().eq('barn_id', barnId), `delete ${table}`)
  }
  mustSucceed(await supabase.from('horses').delete().eq('barn_id', barnId), 'delete horses')
  mustSucceed(await supabase.from('barn_memberships').delete().eq('barn_id', barnId), 'delete barn_memberships')
}

export async function teardownAllData(supabase: SupabaseClient): Promise<void> {
  mustSucceed(await supabase.rpc('teardown_all_lesson_data'), 'teardown all lessons')
  mustSucceed(await supabase.from('lesson_tiers').delete().not('id', 'is', null), 'delete lesson_tiers')
  mustSucceed(await supabase.from('notifications').delete().not('id', 'is', null), 'delete notifications')
  for (const table of ['horse_documents', 'trainer_documents', 'rider_documents']) {
    await removeDocumentStorage(table, await supabase.from(table).select('storage_path').not('id', 'is', null), supabase)
    mustSucceed(await supabase.from(table).delete().not('id', 'is', null), `delete ${table}`)
  }
  mustSucceed(await supabase.from('horses').delete().not('id', 'is', null), 'delete horses')
  mustSucceed(await supabase.from('barn_memberships').delete().not('id', 'is', null), 'delete barn_memberships')
  mustSucceed(await supabase.from('seeded_accounts').delete().not('id', 'is', null), 'delete seeded_accounts')
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
