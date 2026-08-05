/**
 * Lesson participant management over `lesson_horses`/`lesson_riders`: RPC-backed
 * lesson-with-participants create/update, per-rider and per-horse notes writes (each
 * deliberately avoiding an implicit `RETURNING *` outside the caller's column grants —
 * the rider path through the `update_lesson_rider_notes` RPC, the horse path through a
 * bare update; see `updateLessonHorseNotes`' comment), rider cancellation and
 * cancellation-fee collection,
 * `hydrateParticipants`, and a rider's enrolled-lesson ID read.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './member-names'
import { resolveHorseNames } from './horses'
import type { Lesson, LessonType, LessonWithDetails, PaymentType } from './types'

interface LessonHorseJunctionRow {
  lesson_id: string
  horse_id: string
  horses: { is_active: boolean; is_available: boolean } | null
}

export async function hydrateParticipants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessons: Lesson[],
  barnId: string,
  timezone: string
): Promise<LessonWithDetails[]> {
  if (!lessons.length) return []
  const lessonIds = lessons.map((l) => l.id)
  const instructorIds = [...new Set(lessons.map((l) => l.instructor_id).filter(Boolean))] as string[]

  const [
    { data: lessonHorsesData, error: lessonHorsesError },
    { data: lessonRiders, error: lessonRidersError },
  ] = await Promise.all([
    supabase
      .from('lesson_horses')
      // embeds horse status onto the same round trip instead of a second query against `horses`
      .select('lesson_id, horse_id, horses!lesson_horses_barn_id_horse_id_fkey(is_active, is_available)')
      .eq('barn_id', barnId)
      .in('lesson_id', lessonIds),
    supabase.from('lesson_riders').select('lesson_id, rider_id, cancelled_at').eq('barn_id', barnId).in('lesson_id', lessonIds),
  ])

  if (lessonHorsesError) throw lessonHorsesError
  if (lessonRidersError) throw lessonRidersError

  const lessonHorses = (lessonHorsesData ?? []) as unknown as LessonHorseJunctionRow[]
  const horseIds = [...new Set(lessonHorses.map((lh) => lh.horse_id))]
  const riderIds = [...new Set((lessonRiders ?? []).map((lr) => lr.rider_id))]

  const [horseNameMap, membershipMap] = await Promise.all([
    resolveHorseNames(horseIds, barnId, supabase),
    resolveMemberNames([...riderIds, ...instructorIds], barnId, supabase),
  ])

  return lessons.map((lesson) => {
    const instructorName = lesson.instructor_id ? membershipMap.get(lesson.instructor_id) ?? null : null
    const horseJunctionRows = lessonHorses.filter((lh) => lh.lesson_id === lesson.id)
    // #1286: both participant lists are rendered as a sequence (LessonListItem,
    // CalendarLessonCard), and neither junction query can order them — they carry ids only,
    // with the names resolved above. Sorted alphabetically, matching `getHorsesByBarn`'s
    // `ORDER BY h.name`. The sort is on the participant objects rather than on the name
    // arrays, which is what keeps `horse_ids`/`rider_ids`/`rider_cancelled_ats` positionally
    // aligned with the names derived from them below. The id tiebreak follows `schedule.ts`'s
    // `a.start … || a.id …` (a #1015 review finding): two participants can share a name, and
    // the entries tied on it still differ in the id that links them and, for a rider, in
    // `cancelled_at`.
    const horseParticipants = horseJunctionRows
      .map((lh) => ({ id: lh.horse_id, name: horseNameMap.get(lh.horse_id), status: lh.horses }))
      .filter((p): p is { id: string; name: string; status: LessonHorseJunctionRow['horses'] } => Boolean(p.name))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    const horseNames = horseParticipants.map((p) => p.name)
    const horseIdsForLesson = horseParticipants.map((p) => p.id)
    const riderJunctionRows = (lessonRiders ?? []).filter((lr) => lr.lesson_id === lesson.id)
    const riderParticipants = riderJunctionRows
      .map((lr) => ({ id: lr.rider_id, name: membershipMap.get(lr.rider_id), cancelledAt: lr.cancelled_at ?? null }))
      .filter((p): p is { id: string; name: string; cancelledAt: string | null } => Boolean(p.name))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    const riderNames = riderParticipants.map((p) => p.name)
    const riderIdsForLesson = riderParticipants.map((p) => p.id)
    const riderCancelledAts = riderParticipants.map((p) => p.cancelledAt)
    const needsAttention = horseParticipants.some((p) => (p.status ? !p.status.is_active || !p.status.is_available : false))
    return {
      ...lesson,
      lesson_at: { at: lesson.lesson_at, tz: timezone },
      // #885: lessons.payment_type is no longer trustworthy — getLessonsByBarn overlays the
      // real value from get_lesson_payment_info after this returns. getLessonsByIds (the
      // other caller) doesn't render payment_type at all, so the default is never seen there.
      payment_type: null,
      instructor_name: instructorName,
      horse_names: horseNames,
      horse_ids: horseIdsForLesson,
      horse_count: horseJunctionRows.length,
      rider_names: riderNames,
      rider_ids: riderIdsForLesson,
      rider_count: riderJunctionRows.length,
      rider_cancelled_ats: riderCancelledAts,
      needs_attention: needsAttention,
    }
  })
}

export async function createLessonWithParticipants(params: {
  barnId: string
  instructorId: string | null
  lessonAt: string
  fee: number
  horseIds: string[]
  exertionLevels: number[]
  riderIds: string[]
  lessonType: LessonType
  jumping?: boolean
  tierName?: string
  paymentType?: PaymentType | null
}, client?: SupabaseClient): Promise<Lesson> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  // p_instructor_cut is deliberately unpassed (#1154): the RPC ignores it and re-derives the
  // cut server-side (#776), and its DEFAULT 0 lets us stop sending it without a signature
  // change. Why the signature itself stays: docs/architecture/rpc/lessons.md.
  const { data, error } = await supabase.rpc('create_lesson_with_participants', {
    p_barn_id: params.barnId,
    p_instructor_id: params.instructorId,
    p_lesson_at: params.lessonAt,
    p_fee: params.fee,
    p_horse_ids: params.horseIds,
    p_exertion_levels: params.exertionLevels,
    p_rider_ids: params.riderIds,
    p_lesson_type: params.lessonType,
    p_jumping: params.jumping ?? false,
    p_tier_name: params.tierName ?? 'Custom',
    p_payment_type: params.paymentType ?? null,
  })
  if (error) throw error
  return data as Lesson
}

export async function updateLessonWithParticipants(params: {
  lessonId: string
  barnId: string
  lessonAt: string
  instructorId: string | null
  fee: number
  lessonType: LessonType
  jumping: boolean
  paymentType: PaymentType | null
  tierName: string
  horseIds: string[]
  exertionLevels: number[]
  riderIds: string[]
}): Promise<Lesson> {
  const supabase = await createClient()
  // p_instructor_cut deliberately unpassed — see createLessonWithParticipants above.
  const { data, error } = await supabase.rpc('update_lesson_with_participants', {
    p_lesson_id: params.lessonId,
    p_barn_id: params.barnId,
    p_lesson_at: params.lessonAt,
    p_instructor_id: params.instructorId,
    p_fee: params.fee,
    p_lesson_type: params.lessonType,
    p_jumping: params.jumping,
    p_payment_type: params.paymentType,
    p_tier_name: params.tierName,
    p_horse_ids: params.horseIds,
    p_exertion_levels: params.exertionLevels,
    p_rider_ids: params.riderIds,
  })
  if (error) throw error
  return data as Lesson
}

export async function updateLessonRiderNotes(
  lessonId: string,
  riderId: string,
  barnId: string,
  riderNotes: string | null,
  privateNotes: string | null
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_lesson_rider_notes', {
    p_lesson_id: lessonId,
    p_rider_id: riderId,
    p_barn_id: barnId,
    p_rider_notes: riderNotes,
    p_private_notes: privateNotes,
  })

  if (error) throw error
}

// #1082: deliberately no `.select()` — PostgREST turns a bare `.select()` into an implicit
// `RETURNING *`, and Postgres then demands SELECT on every returned column, including
// `exertion_level`, which `authenticated` no longer holds (#937 made the lesson_horses
// SELECT grant column-restricted). UPDATE itself is still table-wide granted and all three
// WHERE columns are inside the granted list, so a plain update needs no RPC.
export async function updateLessonHorseNotes(
  lessonId: string,
  horseId: string,
  barnId: string,
  horseNotes: string | null
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lesson_horses')
    .update({ horse_notes: horseNotes })
    .eq('lesson_id', lessonId)
    .eq('horse_id', horseId)
    .eq('barn_id', barnId)

  if (error) throw error
}

export async function cancelRiderParticipation(
  lessonId: string,
  barnId: string,
  riderId: string,
  notes: string | null | undefined,
  isLate: boolean
): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_rider_participation', {
    p_lesson_id: lessonId,
    p_barn_id: barnId,
    p_rider_id: riderId,
    p_notes: notes ?? null,
    p_is_late: isLate,
  })
  if (error) throw error
  return data === true
}

// #831: not tied to a lessons.id the existing collect_lesson_payment could reuse —
// a rider_cancellation_fee transaction is keyed on lesson_rider_id (see
// sync_rider_cancellation_fee), so this is its own manager-only mark-paid RPC.
export async function updateCancellationFeePaymentType(
  lessonRiderId: string,
  barnId: string,
  paymentType: PaymentType | null
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('collect_rider_cancellation_fee', {
    p_lesson_rider_id: lessonRiderId,
    p_barn_id: barnId,
    p_payment_type: paymentType,
  })
  if (error) throw error
}

export async function getRiderEnrolledLessonIds(barnId: string, userId: string, client?: SupabaseClient): Promise<string[]> {
  const supabase = client ?? await createClient()
  const { data: rider, error: riderError } = await supabase
    .from('barn_memberships')
    .select('id')
    .eq('barn_id', barnId)
    .eq('user_id', userId)
    .eq('role', 'rider')
    .eq('status', 'active')
    .maybeSingle()
  if (riderError) throw riderError
  if (!rider) return []

  const { data: enrollments, error: enrollmentError } = await supabase
    .from('lesson_riders')
    .select('lesson_id')
    .eq('barn_id', barnId)
    .eq('rider_id', rider.id)
  if (enrollmentError) throw enrollmentError
  return (enrollments ?? []).map((e: { lesson_id: string }) => e.lesson_id)
}
