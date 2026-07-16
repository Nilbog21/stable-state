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

export async function getHorseExertionSummary(
  barnId: string,
  targetDate: Date
): Promise<HorseExertionSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_horse_exertion_summary', {
    p_barn_id: barnId,
    p_target_date: targetDate.toISOString(),
  })
  if (error) throw error
  return (data ?? []).map((row: { id: string; name: string; is_active: boolean; is_available: boolean; unavailability_reason: string | null; exhaustion_threshold_high: number | null; exhaustion_threshold_moderate: number | null; lesson_count: number | string; total_exertion: number | string; jumping_count: number | string }) => ({
    id: row.id,
    name: row.name,
    is_active: row.is_active,
    is_available: row.is_available ?? true,
    unavailability_reason: row.unavailability_reason ?? null,
    exhaustion_threshold_high: row.exhaustion_threshold_high,
    exhaustion_threshold_moderate: row.exhaustion_threshold_moderate,
    lessonCount: Number(row.lesson_count),
    totalExertion: Number(row.total_exertion),
    jumpingCount: Number(row.jumping_count),
  }))
}

export async function getHorsesByIds(horseIds: string[], barnId: string): Promise<Horse[]> {
  if (!horseIds.length) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .select()
    .eq('barn_id', barnId)
    .in('id', horseIds)

  if (error) throw error
  return data
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

export async function updateHorseDetails(
  horseId: string,
  barnId: string,
  updates: {
    name?: string
    is_active: boolean
    is_available: boolean
    unavailability_reason: string | null
    exhaustion_thresholds: { moderate: number; high: number } | null
  }
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_horse_details', {
    p_horse_id: horseId,
    p_barn_id: barnId,
    p_name: updates.name ?? null,
    p_is_active: updates.is_active,
    p_is_available: updates.is_available,
    p_unavailability_reason: updates.unavailability_reason,
    p_exhaustion_threshold_moderate: updates.exhaustion_thresholds?.moderate ?? null,
    p_exhaustion_threshold_high: updates.exhaustion_thresholds?.high ?? null,
  })
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

/**
 * Resolves a horse's effective exhaustion thresholds, falling back per-field to the
 * barn's defaults.
 *
 * The DB `CHECK (moderate < high)` only fires when both fields are set on the same
 * row, so it can't see across a horse/barn mix. Overriding only one field at the
 * horse level (e.g. lowering `high` below the barn's `moderate`, or raising
 * `moderate` above the barn's `high`) can produce an inverted pair that never
 * violated either row's own constraint. When both fields are overridden, or
 * neither is, the same-row CHECK already guarantees ordering and this is a no-op.
 * `Math.min(moderate, high - 1)` clamps the resolved pair back into order rather
 * than rejecting or throwing.
 */
export function resolveExhaustionThresholds(
  horse: Pick<Horse, 'exhaustion_threshold_high' | 'exhaustion_threshold_moderate'>,
  barn: Barn
): { high: number; moderate: number } {
  const high = horse.exhaustion_threshold_high ?? barn.exhaustion_threshold_high
  const moderate = horse.exhaustion_threshold_moderate ?? barn.exhaustion_threshold_moderate
  return { high, moderate: Math.min(moderate, high - 1) }
}
