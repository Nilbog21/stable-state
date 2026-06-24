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

export async function teardownBarnData(barnId: string, supabase: SupabaseClient): Promise<void> {
  mustSucceed(await supabase.rpc('teardown_dev_barn_lessons', { p_barn_id: barnId }), 'teardown lessons')
  mustSucceed(await supabase.from('lesson_tiers').delete().eq('barn_id', barnId), 'delete lesson_tiers')
  mustSucceed(await supabase.from('notifications').delete().eq('barn_id', barnId), 'delete notifications')
  mustSucceed(await supabase.from('horses').delete().eq('barn_id', barnId), 'delete horses')
  mustSucceed(await supabase.from('barn_memberships').delete().eq('barn_id', barnId), 'delete barn_memberships')
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
