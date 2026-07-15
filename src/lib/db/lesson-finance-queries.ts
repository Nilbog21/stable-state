import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRiderEnrolledLessonIds } from './lesson-participants'
import { getUserMembership } from './barn-memberships'
import { getTransactionRows, getOutstandingTransactionRows, positiveAmount } from './transactions'
import type { TransactionRow } from './transactions'
import type { Lesson, Role } from './types'

/**
 * Raw-row query layer for lesson finances. No name resolution, no
 * aggregation — just typed raw DB rows. Aggregation and projection into the
 * public API types live in ./lesson-finances.ts.
 */

export interface LessonFeeRow {
  lessonId: string | null
  fee: number
  instructorCut: number
  collected: boolean
  instructorId: string | null
  occurredAt: string
  tierName: string
}

/** tier_name shown for a collected transaction whose lesson was deleted (kept via the
 * lesson_id `ON DELETE SET NULL` FK) — there's no lessons row left to read a real one from. */
const DELETED_LESSON_LABEL = 'Deleted Lesson'

/**
 * Every lesson_fee/instructor_payout/rider_cancellation_fee transaction (#827, #830)
 * in a barn-scoped occurred_at range, merged one row per lesson. tier_name is the
 * only lesson attribute not itself on `transactions`, resolved via a follow-up
 * `.in('id', ids)` lookup (same idiom as agreement-finances.ts:getPaidCharges); instructor_id
 * comes from the instructor_payout row's own membership_id (present only once
 * collected) rather than a second join, since lesson_fee/rider_cancellation_fee never
 * carry a membership_id.
 *
 * A late rider cancellation replaces a normal lesson's `lesson_fee` row with a
 * `rider_cancellation_fee` row (sync_rider_cancellation_fee) — that row has no
 * `lesson_id` of its own (only `lesson_rider_id`), so it's resolved back to its
 * lesson via a `lesson_riders` follow-up lookup before the merge below, letting it
 * combine with that lesson's still-`lesson_id`-keyed instructor_payout row instead of
 * appearing as its own zero-fee orphan.
 *
 * `lesson_id` is nullable on this table (`ON DELETE SET NULL`) so a collected
 * transaction can outlive the deletion of its lesson (see `deleteLesson`'s
 * `deleteCollectedTransactions=false` default) — those rows must still count toward
 * income totals, so they're not filtered out; an orphaned row simply has no `lessons`
 * match. Merge keys off the resolved lesson id when present; an orphaned lesson_fee
 * and its paired instructor_payout both resolve to `null` once nulled, so they can no
 * longer be correlated with each other — each is kept as its own row, keyed by its
 * own transaction `id`, rather than merged into one. This double-counts a deleted
 * lesson as two "Deleted Lesson" rows instead of one, but the dollar totals (which is
 * what income summaries actually need) stay correct either way.
 */
export async function getLessonFeeRows(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<LessonFeeRow[]> {
  const supabase = client ?? await createClient()
  const rawRows = await getTransactionRows(
    barnId, ['lesson_fee', 'instructor_payout', 'rider_cancellation_fee'], { startDate, endDate }, supabase
  )

  const lessonRiderIds = [...new Set(
    rawRows
      .filter((r) => r.kind === 'rider_cancellation_fee')
      .map((r) => r.lessonRiderId)
      .filter((id): id is string => id !== null)
  )]
  const lessonIdByLessonRiderId = new Map<string, string | null>()
  if (lessonRiderIds.length) {
    const { data, error } = await supabase
      .from('lesson_riders')
      .select('id, lesson_id')
      .eq('barn_id', barnId)
      .in('id', lessonRiderIds)
    if (error) throw error
    for (const lr of data ?? []) lessonIdByLessonRiderId.set(lr.id, lr.lesson_id)
  }

  const resolvedLessonId = (raw: TransactionRow): string | null =>
    raw.kind === 'rider_cancellation_fee'
      ? (raw.lessonRiderId ? lessonIdByLessonRiderId.get(raw.lessonRiderId) ?? null : null)
      : raw.lessonId

  const lessonIds = [...new Set(rawRows.map(resolvedLessonId).filter((id): id is string => id !== null))]
  const tierNameByLessonId = new Map<string, string>()
  if (lessonIds.length) {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, tier_name')
      .eq('barn_id', barnId)
      .in('id', lessonIds)
    if (error) throw error
    for (const lesson of data ?? []) tierNameByLessonId.set(lesson.id, lesson.tier_name)
  }

  const rows = new Map<string, LessonFeeRow>()
  for (const raw of rawRows) {
    const lessonId = resolvedLessonId(raw)
    const key = lessonId ?? raw.id
    const existing = rows.get(key) ?? {
      lessonId,
      fee: 0,
      instructorCut: 0,
      collected: false,
      instructorId: null,
      occurredAt: raw.occurredAt,
      tierName: (lessonId && tierNameByLessonId.get(lessonId)) ?? DELETED_LESSON_LABEL,
    }
    // `collected` is read off every kind, not just lesson_fee: an orphaned
    // instructor_payout row (its paired fee row nulled to a different key, see the
    // merge-key comment above) has no fee row to inherit `collected` from — and
    // instructor_payout is only ever inserted when already collected (see
    // sync_lesson_transactions), so this is always safe.
    existing.collected = raw.collected
    if (raw.kind === 'lesson_fee' || raw.kind === 'rider_cancellation_fee') {
      existing.fee = raw.amount
      existing.occurredAt = raw.occurredAt
    } else {
      existing.instructorCut = positiveAmount(raw.kind, raw.amount)
      existing.instructorId = raw.membershipId
    }
    rows.set(key, existing)
  }
  return [...rows.values()]
}

export interface TierPriceRow {
  name: string
  price: number
}

export async function getTierPricesByNames(
  barnId: string,
  names: string[],
  client?: SupabaseClient
): Promise<TierPriceRow[]> {
  if (!names.length) return []

  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lesson_tiers')
    .select('name, price')
    .eq('barn_id', barnId)
    .in('name', names)

  if (error) throw error
  return data ?? []
}

export type OutstandingLessonRow = Pick<Lesson, 'id' | 'barn_id' | 'lesson_at' | 'instructor_id' | 'fee'>

/**
 * #831: lessons.payment_type is no longer a column — a candidate lesson (past,
 * non-zero fee, role-scoped exactly as before) is only "outstanding" once its
 * lesson_fee transaction is confirmed uncollected via get_outstanding_transactions
 * (transactions SELECT is manager-only RLS, so trainer/rider callers need that
 * relay). A late-cancelled lesson's lesson_fee row no longer exists at all (see
 * sync_rider_cancellation_fee) — it naturally drops out here and surfaces instead
 * via getOutstandingCancellationFeeRows below.
 */
export async function getOutstandingLessonRows(
  barnId: string,
  userId?: string,
  role?: Role,
  client?: SupabaseClient
): Promise<OutstandingLessonRow[]> {
  const supabase = client ?? await createClient()
  const now = new Date()

  let candidates: OutstandingLessonRow[]

  if (role === 'rider' && userId) {
    const lessonIds = await getRiderEnrolledLessonIds(barnId, userId, supabase)
    if (!lessonIds.length) return []

    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .in('id', lessonIds)
      .eq('barn_id', barnId)
      .lt('lesson_at', now.toISOString())
      .order('lesson_at', { ascending: true })

    if (error) throw error
    candidates = ((data ?? []) as OutstandingLessonRow[]).filter((l) => l.fee !== 0)
  } else {
    let query = supabase
      .from('lessons')
      .select('*')
      .eq('barn_id', barnId)
      .lt('lesson_at', now.toISOString())

    if (role === 'trainer' && userId) {
      const callerMembership = await getUserMembership(userId, barnId)
      if (!callerMembership) return []
      query = query.eq('instructor_id', callerMembership.id)
    }

    const { data, error } = await query.order('lesson_at', { ascending: true })
    if (error) throw error
    candidates = ((data ?? []) as OutstandingLessonRow[]).filter((l) => l.fee !== 0)
  }

  if (!candidates.length) return []

  const outstandingRows = await getOutstandingTransactionRows(
    barnId, { lessonIds: candidates.map((l) => l.id) }, supabase
  )
  const unpaidLessonIds = new Set(outstandingRows.filter((r) => !r.collected).map((r) => r.entityId))
  return candidates.filter((l) => unpaidLessonIds.has(l.id))
}

export interface OutstandingCancellationFeeRow {
  id: string // lesson_rider_id — used for the mark-paid action
  lessonId: string
  lessonAt: string
  instructorId: string | null
  riderId: string
  fee: number
}

/**
 * #831/#830: a late-cancelled normal lesson's fee lives as a rider_cancellation_fee
 * transaction keyed on lesson_rider_id (not lesson_id), so it never appears in
 * getOutstandingLessonRows above. Candidate cancelled lesson_riders rows come from
 * a plain RLS-scoped query — manager/trainer both currently see barn-wide via
 * lesson_riders_select_staff, so trainer still needs the explicit own-instructor
 * filter below (mirroring getOutstandingLessonRows' trainer scoping); a rider's
 * own RLS (auth_is_enrolled_rider) already limits them to their own cancelled
 * participation, since a normal lesson has exactly one rider.
 */
export async function getOutstandingCancellationFeeRows(
  barnId: string,
  userId?: string,
  role?: Role,
  client?: SupabaseClient
): Promise<OutstandingCancellationFeeRow[]> {
  const supabase = client ?? await createClient()

  const { data, error } = await supabase
    .from('lesson_riders')
    .select('id, lesson_id, rider_id')
    .eq('barn_id', barnId)
    .not('cancelled_at', 'is', null)
  if (error) throw error

  const cancelledRows = (data ?? []) as { id: string; lesson_id: string; rider_id: string }[]
  if (!cancelledRows.length) return []

  const lessonIds = [...new Set(cancelledRows.map((r) => r.lesson_id))]
  const { data: lessonData, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, lesson_at, instructor_id')
    .eq('barn_id', barnId)
    .in('id', lessonIds)
  if (lessonsError) throw lessonsError

  const lessonById = new Map(
    ((lessonData ?? []) as { id: string; lesson_at: string; instructor_id: string | null }[]).map((l) => [l.id, l])
  )

  let scopedRows = cancelledRows
  if (role === 'trainer' && userId) {
    const callerMembership = await getUserMembership(userId, barnId)
    if (!callerMembership) return []
    scopedRows = scopedRows.filter((r) => lessonById.get(r.lesson_id)?.instructor_id === callerMembership.id)
  }
  if (!scopedRows.length) return []

  const outstandingRows = await getOutstandingTransactionRows(
    barnId, { lessonRiderIds: scopedRows.map((r) => r.id) }, supabase
  )
  const feeByLessonRiderId = new Map(outstandingRows.filter((r) => !r.collected).map((r) => [r.entityId, r.amount]))
  if (!feeByLessonRiderId.size) return []

  return scopedRows
    .filter((r) => feeByLessonRiderId.has(r.id))
    .map((r) => {
      // lesson_riders.lesson_id cascades from lessons (ON DELETE CASCADE), so a
      // cancelled row's own lesson is always still present in the same barn.
      const lesson = lessonById.get(r.lesson_id)!
      return {
        id: r.id,
        lessonId: r.lesson_id,
        lessonAt: lesson.lesson_at,
        instructorId: lesson.instructor_id,
        riderId: r.rider_id,
        fee: feeByLessonRiderId.get(r.id)!,
      }
    })
}

/**
 * One row per lesson-participant junction row (lesson_riders or lesson_horses),
 * merging the two former near-identical fetchers. `participantColumn` names the
 * key under which the participant id appears (`rider_id`/`horse_id`) so callers
 * and their consumers keep the same property names as before the merge.
 */
export async function getLessonJunctionRows<C extends 'rider_id' | 'horse_id'>(
  table: 'lesson_riders' | 'lesson_horses',
  participantColumn: C,
  barnId: string,
  lessonIds: string[],
  client?: SupabaseClient
): Promise<({ lesson_id: string } & Record<C, string>)[]> {
  if (!lessonIds.length) return []

  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from(table)
    .select(`lesson_id, ${participantColumn}`)
    .eq('barn_id', barnId)
    .in('lesson_id', lessonIds)

  if (error) throw error
  return (data ?? []) as ({ lesson_id: string } & Record<C, string>)[]
}

