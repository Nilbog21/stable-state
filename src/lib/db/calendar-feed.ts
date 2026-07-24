import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarFeedData } from './types'

export async function getOrCreateCalendarFeedToken(
  membershipId: string,
  barnId: string,
  client?: SupabaseClient
): Promise<string> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('calendar_feed_token')
    .eq('id', membershipId)
    .eq('barn_id', barnId)
    .single()
  if (error) throw error
  if (data.calendar_feed_token) return data.calendar_feed_token

  return regenerateCalendarFeedToken(membershipId, barnId, supabase)
}

export async function regenerateCalendarFeedToken(
  membershipId: string,
  barnId: string,
  client?: SupabaseClient
): Promise<string> {
  const supabase = client ?? await createClient()
  const newToken = crypto.randomUUID()
  const { data, error } = await supabase
    .from('barn_memberships')
    .update({ calendar_feed_token: newToken })
    .eq('id', membershipId)
    .eq('barn_id', barnId)
    .select('calendar_feed_token')
    .single()

  if (error) throw error
  return data.calendar_feed_token
}

export async function getCalendarFeedData(
  token: string,
  client?: SupabaseClient
): Promise<CalendarFeedData> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .rpc('get_calendar_feed', { p_token: token })
    .single()
  if (error) throw error

  const row = data as { valid: boolean; barn_name: string | null; items: CalendarFeedData['items'] }
  return { valid: row.valid, barnName: row.barn_name, items: row.items }
}
