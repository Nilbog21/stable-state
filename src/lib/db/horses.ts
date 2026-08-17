/**
 * Horse registry: barn/owner/ID reads and `resolveHorseNames`, RPC-backed detail/notes
 * mutations (`update_horse_details`, `update_horse_notes`), exertion-summary and
 * projected-exhaustion reads with `resolveExhaustionThresholds`, upcoming-lesson
 * lookup, and photo upload/replace/remove orchestration over `document-storage.ts` plus
 * the `update_horse_photo` RPC.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Barn, Horse, HorseExertionSummary, Instant } from './types'
import { removeFile, uploadFile } from './document-storage'

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

// owningMemberId is required (#1549): horses.owning_member_id is NOT NULL, and making the
// argument mandatory is what stops a new call site from quietly creating an ownerless horse --
// the type error is the enforcement, since there is no sensible default a DAL function could pick.
export async function createHorse(barnId: string, name: string, owningMemberId: string, client?: SupabaseClient): Promise<Horse> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('horses')
    .insert({ barn_id: barnId, name, owning_member_id: owningMemberId })
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
  return (data ?? []).map((row: { id: string; name: string; registered_name?: string | null; is_active: boolean; is_available: boolean; unavailability_reason: string | null; exhaustion_threshold_high: number | null; exhaustion_threshold_moderate: number | null; lesson_count: number | string; total_exertion: number | string; jumping_count: number | string }) => ({
    id: row.id,
    name: row.name,
    registered_name: row.registered_name ?? null,
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

// #1000: no is_active filter, unlike getHorsesByBarn — an owner's deactivated horse must still
// surface in the Horses-list page's My Owned Horses section, badged Inactive, even for a rider/trainer
// who otherwise never sees the manager-only Inactive section.
export async function getOwnedHorses(barnId: string, membershipId: string): Promise<Horse[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .select()
    .eq('barn_id', barnId)
    .eq('owning_member_id', membershipId)
    .order('name')

  if (error) throw error
  return data
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

export async function getHorseById(horseId: string, barnId: string, client?: SupabaseClient): Promise<Horse | null> {
  const supabase = client ?? await createClient()
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
    feed_notes: string | null
    medication_notes: string | null
    registered_name: string | null
    owning_member_id: string | null
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
    p_feed_notes: updates.feed_notes,
    p_medication_notes: updates.medication_notes,
    p_registered_name: updates.registered_name,
    p_owning_member_id: updates.owning_member_id,
  })
  if (error) throw error
}

export async function updateHorseNotes(
  horseId: string,
  barnId: string,
  updates: { feed_notes: string | null; medication_notes: string | null }
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_horse_notes', {
    p_horse_id: horseId,
    p_barn_id: barnId,
    p_feed_notes: updates.feed_notes,
    p_medication_notes: updates.medication_notes,
  })
  if (error) throw error
}

export async function updateHorsePhotoPath(horseId: string, barnId: string, photoPath: string | null, client?: SupabaseClient): Promise<void> {
  // A script-injected (service-role) client bypasses the owner/manager RPC's
  // auth.uid() check entirely, same as the plain .update() a trusted script would run.
  // There's no acting membership to attribute a set to, so only clear photo_uploaded_by
  // on delete; a set leaves whatever attribution (if any) was already there untouched.
  if (client) {
    const update: { photo_path: string | null; photo_uploaded_by?: null } = { photo_path: photoPath }
    if (photoPath === null) update.photo_uploaded_by = null
    const { error } = await client
      .from('horses')
      .update(update)
      .eq('id', horseId)
      .eq('barn_id', barnId)
    if (error) throw error
    return
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_horse_photo', {
    p_horse_id: horseId,
    p_barn_id: barnId,
    p_photo_path: photoPath,
  })
  if (error) throw error
}

export async function replaceHorsePhoto(horseId: string, barnId: string, file: File, ext: string, client?: SupabaseClient): Promise<void> {
  // ponytail: re-fetches the current photo_path here rather than trusting a value bound at
  // page-render time, so a concurrent replace/remove can't be clobbered by a stale caller.
  const current = await getHorseById(horseId, barnId, client)
  const storagePath = `${barnId}/horse-photos/${horseId}/${Date.now()}.${ext}`

  await uploadFile(storagePath, file, file.type, client)

  try {
    await updateHorsePhotoPath(horseId, barnId, storagePath, client)
  } catch (err) {
    await removeFile(storagePath, client).catch(() => {})
    throw err
  }

  if (current?.photo_path) {
    await removeFile(current.photo_path, client).catch(() => {})
  }
}

export async function removeHorsePhoto(horseId: string, barnId: string, client?: SupabaseClient): Promise<void> {
  const current = await getHorseById(horseId, barnId, client)
  if (!current?.photo_path) return
  await updateHorsePhotoPath(horseId, barnId, null, client)
  await removeFile(current.photo_path, client).catch(() => {})
}

export async function getHorseProjectedExhaustion(
  horseId: string,
  barnId: string,
  targetDate: Date,
  timezone: string,
  excludeLessonId?: string
): Promise<{ lessonAt: Instant; exertionLevel: number }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_horse_projected_exhaustion', {
    p_horse_id: horseId,
    p_barn_id: barnId,
    p_target_date: targetDate.toISOString(),
    p_exclude_lesson_id: excludeLessonId ?? null,
  })
  if (error) throw error
  return (data ?? []).map((row: { lesson_at: string; exertion_level: number }) => ({
    lessonAt: { at: row.lesson_at, tz: timezone },
    exertionLevel: Number(row.exertion_level),
  }))
}

// Two-step lookup (link ids, then the lessons themselves) rather than an embedded
// `lessons!inner` join -- mirrors getLessonsByBarn's rider branch, and avoids the
// FK-embed ambiguity gotcha documented in agreement-finances.ts's outstanding-charges
// query (#665).
export async function getUpcomingLessonsForHorse(
  horseId: string,
  barnId: string,
  timezone: string
): Promise<{ id: string; lessonAt: Instant }[]> {
  const supabase = await createClient()
  const { data: links, error: linksError } = await supabase
    .from('lesson_horses')
    .select('lesson_id')
    .eq('horse_id', horseId)
    .eq('barn_id', barnId)
  if (linksError) throw linksError

  const lessonIds = (links ?? []).map((l) => l.lesson_id)
  if (!lessonIds.length) return []

  const { data, error } = await supabase
    .from('lessons')
    .select('id, lesson_at')
    .in('id', lessonIds)
    .eq('barn_id', barnId)
    .is('cancelled_at', null)
    .gte('lesson_at', new Date().toISOString())
    .order('lesson_at', { ascending: true })
  if (error) throw error

  return (data ?? []).map((row: { id: string; lesson_at: string }) => ({ id: row.id, lessonAt: { at: row.lesson_at, tz: timezone } }))
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
