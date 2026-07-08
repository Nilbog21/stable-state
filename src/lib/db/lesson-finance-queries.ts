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

export interface LessonRiderRow {
  lesson_id: string
  rider_id: string
}

export async function getLessonRidersForLessons(
  barnId: string,
  lessonIds: string[],
  client?: SupabaseClient
): Promise<LessonRiderRow[]> {
  if (!lessonIds.length) return []

  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lesson_riders')
    .select('lesson_id, rider_id')
    .eq('barn_id', barnId)
    .in('lesson_id', lessonIds)

  if (error) throw error
  return data ?? []
}

export type PaidLessonFeeRow = Pick<Lesson, 'id' | 'fee'>

export async function getPaidLessonFees(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<PaidLessonFeeRow[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('id, fee')
    .eq('barn_id', barnId)
    .not('payment_type', 'is', null)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())

  if (error) throw error
  return data ?? []
}

export interface LessonHorseRow {
  lesson_id: string
  horse_id: string
}

export async function getLessonHorsesForLessons(
  barnId: string,
  lessonIds: string[],
  client?: SupabaseClient
): Promise<LessonHorseRow[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lesson_horses')
    .select('lesson_id, horse_id')
    .eq('barn_id', barnId)
    .in('lesson_id', lessonIds)

  if (error) throw error
  return data ?? []
}

export type PaidLessonInstructorFeeRow = Pick<Lesson, 'instructor_id' | 'fee'>

export async function getPaidLessonInstructorFees(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<PaidLessonInstructorFeeRow[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('instructor_id, fee')
    .eq('barn_id', barnId)
    .not('payment_type', 'is', null)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())

  if (error) throw error
  return data ?? []
}

export type PaidLessonFeeAtRow = Pick<Lesson, 'id' | 'fee' | 'lesson_at'>

export async function getPaidLessonFeesAt(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<PaidLessonFeeAtRow[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('id, fee, lesson_at')
    .eq('barn_id', barnId)
    .not('payment_type', 'is', null)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())
    .order('lesson_at', { ascending: true })

  if (error) throw error
  return data ?? []
}
