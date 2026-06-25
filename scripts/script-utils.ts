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
  mustSucceed(await supabase.from('horse_documents').delete().eq('barn_id', barnId), 'delete horse_documents')
  mustSucceed(await supabase.from('trainer_documents').delete().eq('barn_id', barnId), 'delete trainer_documents')
  mustSucceed(await supabase.from('rider_documents').delete().eq('barn_id', barnId), 'delete rider_documents')
  mustSucceed(await supabase.from('horses').delete().eq('barn_id', barnId), 'delete horses')
  mustSucceed(await supabase.from('barn_memberships').delete().eq('barn_id', barnId), 'delete barn_memberships')
}

export async function teardownAllData(supabase: SupabaseClient): Promise<void> {
  mustSucceed(await supabase.rpc('teardown_all_lesson_data'), 'teardown all lessons')
  mustSucceed(await supabase.from('lesson_tiers').delete().not('id', 'is', null), 'delete lesson_tiers')
  mustSucceed(await supabase.from('notifications').delete().not('id', 'is', null), 'delete notifications')
  mustSucceed(await supabase.from('horse_documents').delete().not('id', 'is', null), 'delete horse_documents')
  mustSucceed(await supabase.from('trainer_documents').delete().not('id', 'is', null), 'delete trainer_documents')
  mustSucceed(await supabase.from('rider_documents').delete().not('id', 'is', null), 'delete rider_documents')
  mustSucceed(await supabase.from('horses').delete().not('id', 'is', null), 'delete horses')
  mustSucceed(await supabase.from('barn_memberships').delete().not('id', 'is', null), 'delete barn_memberships')
  mustSucceed(await supabase.from('profiles').delete().not('id', 'is', null), 'delete profiles')
  mustSucceed(await supabase.from('barns').delete().not('id', 'is', null), 'delete barns')
  let page = 1
  let hasMore = true
  while (hasMore) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
    if (error) throw new Error(`list auth users: ${error.message}`)
    if (!data) break
    for (const user of data.users) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(user.id)
      if (delErr) throw new Error(`delete auth user ${user.id}: ${delErr.message}`)
    }
    hasMore = data.users.length === 50
    page++
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
