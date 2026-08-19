/**
 * Barn record reads and settings writes: `getBarnBySlug` (request-deduped via React
 * `cache`), per-setting mutations (default board fee, timezone, schedule buffer
 * minutes, exhaustion thresholds), `setInstructorCut` via the `set_instructor_cut` RPC,
 * and the demo-barn lifecycle
 * (`createDemoBarn`/`countDemoBarns`/`getOldestDemoBarn`/`deleteBarn`) — the lifecycle
 * four take a required injected client and never fall back to the request-scoped SSR
 * client; their `/demo` and `/api/cron/reset-demo` callers inject a service-role
 * client.
 */
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Barn } from './types'

export const getBarnBySlug = cache(async function getBarnBySlug(slug: string, client?: SupabaseClient): Promise<Barn | null> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barns')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw error
  return data
})

export async function updateBarnDefaultBoardFee(
  barnId: string,
  defaultBoardFee: number,
  client?: SupabaseClient
): Promise<Barn> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barns')
    .update({ default_board_fee: defaultBoardFee })
    .eq('id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateBarnTimezone(
  barnId: string,
  timezone: string,
  client?: SupabaseClient
): Promise<Barn> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barns')
    .update({ timezone })
    .eq('id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function setInstructorCut(barnId: string, value: number, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.rpc('set_instructor_cut', { p_barn_id: barnId, p_value: value })
  if (error) throw error
}

export async function updateScheduleBufferMinutes(
  barnId: string,
  minutes: number,
  client?: SupabaseClient
): Promise<Barn> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barns')
    .update({ schedule_buffer_minutes: minutes })
    .eq('id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function createDemoBarn(slug: string, client: SupabaseClient): Promise<Barn> {
  const { data, error } = await client
    .from('barns')
    .insert({ name: 'Demo Barn', slug, is_demo: true })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function countDemoBarns(client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from('barns')
    .select('id', { count: 'exact', head: true })
    .eq('is_demo', true)

  if (error) throw error
  return count ?? 0
}

export async function getOldestDemoBarn(client: SupabaseClient): Promise<Barn | null> {
  const { data, error } = await client
    .from('barns')
    .select('*')
    .eq('is_demo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function deleteBarn(barnId: string, client: SupabaseClient): Promise<void> {
  const { error } = await client.from('barns').delete().eq('id', barnId)
  if (error) throw error
}

export async function updateExhaustionThresholds(
  barnId: string,
  updates: { moderate: number; high: number },
  client?: SupabaseClient
): Promise<Barn> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barns')
    .update({
      exhaustion_threshold_moderate: updates.moderate,
      exhaustion_threshold_high: updates.high,
    })
    .eq('id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}
