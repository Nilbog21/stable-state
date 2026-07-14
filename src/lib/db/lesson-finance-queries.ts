import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getRiderEnrolledLessonIds } from './lesson-participants'
import { getUserMembership } from './barn-memberships'
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
export const DELETED_LESSON_LABEL = 'Deleted Lesson'

/**
 * Every lesson_fee/instructor_payout transaction (#827) in a barn-scoped occurred_at
 * range, merged one row per lesson. tier_name is the only lesson attribute not itself
 * on `transactions`, pulled in via the FK-hint embed (same pattern as
 * agreements.ts:getPaidCharges); instructor_id comes from the instructor_payout row's
 * own membership_id (present only once collected) rather than a second join, since
 * lesson_fee never carries a membership_id.
 *
 * `lesson_id` is nullable on this table (`ON DELETE SET NULL`) so a collected
 * transaction can outlive the deletion of its lesson (see `deleteLesson`'s
 * `deleteCollectedTransactions=false` default) — those rows must still count toward
 * income totals, so they're not filtered out. The embed is a left join (no `!inner`)
 * for the same reason: an orphaned row has no `lessons` match. Merge keys off
 * `lesson_id` when present; an orphaned lesson_fee and its paired instructor_payout
 * both have `lesson_id = NULL` once nulled, so they can no longer be correlated with
 * each other — each is kept as its own row, keyed by its own transaction `id`, rather
 * than merged into one. This double-counts a deleted lesson as two "Deleted Lesson"
 * rows instead of one, but the dollar totals (which is what income summaries actually
 * need) stay correct either way.
 */
export async function getLessonFeeRows(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<LessonFeeRow[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('id, lesson_id, kind, amount, collected, membership_id, occurred_at, lessons!transactions_barn_id_lesson_id_fkey(tier_name)')
    .eq('barn_id', barnId)
    .in('kind', ['lesson_fee', 'instructor_payout'])
    .gte('occurred_at', startDate.toISOString())
    .lt('occurred_at', endDate.toISOString())
    .order('occurred_at', { ascending: true })

  if (error) throw error

  type RawRow = {
    id: string
    lesson_id: string | null
    kind: 'lesson_fee' | 'instructor_payout'
    amount: number
    collected: boolean
    membership_id: string | null
    occurred_at: string
    lessons: { tier_name: string } | null
  }

  const rows = new Map<string, LessonFeeRow>()
  for (const raw of (data ?? []) as unknown as RawRow[]) {
    const key = raw.lesson_id ?? raw.id
    const existing = rows.get(key) ?? {
      lessonId: raw.lesson_id,
      fee: 0,
      instructorCut: 0,
      collected: false,
      instructorId: null,
      occurredAt: raw.occurred_at,
      tierName: raw.lessons?.tier_name ?? DELETED_LESSON_LABEL,
    }
    // `collected` is read off both kinds, not just lesson_fee: an orphaned
    // instructor_payout row (its paired lesson_fee nulled to a different key,
    // see the merge-key comment above) has no lesson_fee row to inherit
    // `collected` from — and instructor_payout is only ever inserted when
    // already collected (see sync_lesson_transactions), so this is always safe.
    existing.collected = raw.collected
    if (raw.kind === 'lesson_fee') {
      existing.fee = raw.amount
      existing.occurredAt = raw.occurred_at
    } else {
      existing.instructorCut = -raw.amount
      existing.instructorId = raw.membership_id
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

export async function getOutstandingLessonRows(
  barnId: string,
  userId?: string,
  role?: Role,
  client?: SupabaseClient
): Promise<OutstandingLessonRow[]> {
  const supabase = client ?? await createClient()
  const now = new Date()

  if (role === 'rider' && userId) {
    const lessonIds = await getRiderEnrolledLessonIds(barnId, userId, supabase)
    if (!lessonIds.length) return []

    const { data, error } = await supabase
      .from('lessons')
      .select('*')
      .in('id', lessonIds)
      .eq('barn_id', barnId)
      .is('payment_type', null)
      .lt('lesson_at', now.toISOString())
      .order('lesson_at', { ascending: true })

    if (error) throw error
    return ((data ?? []) as OutstandingLessonRow[]).filter((l) => l.fee !== 0)
  }

  let query = supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .is('payment_type', null)
    .lt('lesson_at', now.toISOString())

  if (role === 'trainer' && userId) {
    const callerMembership = await getUserMembership(userId, barnId)
    if (!callerMembership) return []
    query = query.eq('instructor_id', callerMembership.id)
  }

  const { data, error } = await query.order('lesson_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as OutstandingLessonRow[]).filter((l) => l.fee !== 0)
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

