import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Barn, Horse, HorseExertionSummary } from './types'

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
  const { error } = await supabase.rpc('update_horse_details', {
    p_horse_id: horseId,
    p_barn_id: barnId,
    p_name: updates.name ?? null,
    p_is_active: updates.is_active,
    p_is_available: updates.is_available,
    p_unavailability_reason: updates.unavailability_reason,
  })
  if (error) throw error
}

export async function updateHorseExhaustionThresholds(
  horseId: string,
  barnId: string,
  thresholds: { moderate: number; high: number } | null
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('horses')
    .update({
      exhaustion_threshold_moderate: thresholds?.moderate ?? null,
      exhaustion_threshold_high: thresholds?.high ?? null,
    })
    .eq('id', horseId)
    .eq('barn_id', barnId)

  if (error) throw error
}

export async function getHorseProjectedExhaustion(
  horseId: string,
  barnId: string,
  targetDate: Date,
  excludeLessonId?: string
): Promise<{ lessonAt: string; exertionLevel: number }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_horse_projected_exhaustion', {
    p_horse_id: horseId,
    p_barn_id: barnId,
    p_target_date: targetDate.toISOString(),
    p_exclude_lesson_id: excludeLessonId ?? null,
  })
  if (error) throw error
  return (data ?? []).map((row: { lesson_at: string; exertion_level: number }) => ({
    lessonAt: row.lesson_at,
    exertionLevel: Number(row.exertion_level),
  }))
}

export function resolveExhaustionThresholds(horse: Horse, barn: Barn): { high: number; moderate: number } {
  const high = horse.exhaustion_threshold_high ?? barn.exhaustion_threshold_high
  const moderate = horse.exhaustion_threshold_moderate ?? barn.exhaustion_threshold_moderate
  // A per-horse override on only one field can invert the pair against the other's barn
  // default — the DB CHECK only guards moderate < high when both are set on the same row.
  return { high, moderate: Math.min(moderate, high - 1) }
}

export { getExhaustionBand, type ExhaustionBand } from '@/lib/exhaustion-band'
