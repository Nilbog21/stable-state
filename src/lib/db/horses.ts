import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Horse, HorseExertionSummary } from './types'

export async function getHorsesByBarn(barnId: string): Promise<Horse[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .select()
    .eq('barn_id', barnId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data
}

export async function createHorse(barnId: string, name: string, client?: SupabaseClient): Promise<Horse> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('horses')
    .insert({ barn_id: barnId, name })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateHorse(horseId: string, barnId: string, name: string): Promise<Horse> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .update({ name })
    .eq('id', horseId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function setHorseActive(horseId: string, barnId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('horses')
    .update({ is_active: isActive })
    .eq('id', horseId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
}

export async function getHorseExertionSummary(
  barnId: string,
  since: Date
): Promise<HorseExertionSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_horse_exertion_summary', {
    p_barn_id: barnId,
    p_since: since.toISOString(),
  })
  if (error) throw error
  return (data ?? []).map((row: { id: string; name: string; is_active: boolean; is_available: boolean; unavailability_reason: string | null; lesson_count: number | string; total_exertion: number | string; jumping_count: number | string }) => ({
    id: row.id,
    name: row.name,
    is_active: row.is_active,
    is_available: row.is_available ?? true,
    unavailability_reason: row.unavailability_reason ?? null,
    lessonCount: Number(row.lesson_count),
    totalExertion: Number(row.total_exertion),
    jumpingCount: Number(row.jumping_count),
  }))
}

export async function getHorseById(horseId: string, barnId: string): Promise<Horse | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .select()
    .eq('id', horseId)
    .eq('barn_id', barnId)
    .single()

  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null
    throw error
  }
  return data
}

export async function resolveHorseNames(
  horseIds: string[],
  barnId: string,
  client?: SupabaseClient
): Promise<Map<string, string>> {
  if (!horseIds.length) return new Map()
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('horses')
    .select('id, name')
    .eq('barn_id', barnId)
    .in('id', horseIds)
  if (error) throw error
  return new Map((data ?? []).map((h: { id: string; name: string }) => [h.id, h.name]))
}

export async function setHorseAvailability(
  horseId: string,
  barnId: string,
  isAvailable: boolean,
  reason: string | null
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('horses')
    .update({ is_available: isAvailable, unavailability_reason: reason })
    .eq('id', horseId)
    .eq('barn_id', barnId)

  if (error) throw error
}

export async function updateHorseDetails(
  horseId: string,
  barnId: string,
  updates: { name?: string; is_active: boolean; is_available: boolean; unavailability_reason: string | null }
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('horses')
    .update(updates)
    .eq('id', horseId)
    .eq('barn_id', barnId)
  if (error) throw error
}
