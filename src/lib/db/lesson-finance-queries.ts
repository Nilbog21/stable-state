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

export async function getLessonsForSummary(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<Lesson[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())

  if (error) throw error
  return data ?? []
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

export type PaidLessonColumn = 'id' | 'fee' | 'lesson_at' | 'instructor_id'

/** Row shape covering every column combination the three former fetchers selected; only `fee` is always selected. */
export interface PaidLessonRow {
  id?: string
  fee: number
  lesson_at?: string
  instructor_id?: string | null
}

/**
 * Paid lessons (non-null payment_type) in a barn-scoped date range, projected
 * to just the given columns — merges the three former near-identical fetchers
 * (id+fee, instructor_id+fee, id+fee+lesson_at) into one parameterized query.
 */
export async function getPaidLessonRows(
  barnId: string,
  startDate: Date,
  endDate: Date,
  columns: PaidLessonColumn[],
  client?: SupabaseClient
): Promise<PaidLessonRow[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select(columns.join(', '))
    .eq('barn_id', barnId)
    .not('payment_type', 'is', null)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())
    .order('lesson_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as PaidLessonRow[]
}
