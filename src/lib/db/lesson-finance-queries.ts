import type { SupabaseClient } from '@supabase/supabase-js'
import { getRiderEnrolledLessonIds } from './lesson-participants'
import type { Lesson, Role } from './types'

/**
 * Raw-row query layer for lesson finances. Every function takes an explicit,
 * required Supabase client (no internal createClient() fallback) so tests can
 * pass in a plain stub without mocking @/lib/supabase/server.
 *
 * No name resolution, no aggregation — just typed raw DB rows. Aggregation and
 * projection into the public API types live in ./lesson-finances.ts.
 */

export async function getLessonsForSummary(
  client: SupabaseClient,
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<Lesson[]> {
  const { data, error } = await client
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
  price: number | null
}

export async function getTierPricesByNames(
  client: SupabaseClient,
  barnId: string,
  names: string[]
): Promise<TierPriceRow[]> {
  if (!names.length) return []

  const { data, error } = await client
    .from('lesson_tiers')
    .select('name, price')
    .eq('barn_id', barnId)
    .in('name', names)

  if (error) throw error
  return data ?? []
}

export type OutstandingLessonRow = Pick<Lesson, 'id' | 'barn_id' | 'lesson_at' | 'instructor_id' | 'fee'>

export async function getOutstandingLessonRows(
  client: SupabaseClient,
  barnId: string,
  userId?: string,
  role?: Role
): Promise<OutstandingLessonRow[]> {
  const now = new Date()

  if (role === 'rider' && userId) {
    const lessonIds = await getRiderEnrolledLessonIds(barnId, userId)
    if (!lessonIds.length) return []

    const { data, error } = await client
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

  let query = client
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .is('payment_type', null)
    .lt('lesson_at', now.toISOString())

  if (role === 'trainer' && userId) {
    query = query.eq('instructor_id', userId)
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
  client: SupabaseClient,
  barnId: string,
  lessonIds: string[]
): Promise<LessonRiderRow[]> {
  if (!lessonIds.length) return []

  const { data, error } = await client
    .from('lesson_riders')
    .select('lesson_id, rider_id')
    .eq('barn_id', barnId)
    .in('lesson_id', lessonIds)

  if (error) throw error
  return data ?? []
}

export interface ProfileNameRow {
  user_id: string
  first_name: string
  last_name: string
}

export async function getProfileNamesByUserIds(
  client: SupabaseClient,
  userIds: string[]
): Promise<ProfileNameRow[]> {
  if (!userIds.length) return []

  const { data, error } = await client
    .from('profiles')
    .select('user_id, first_name, last_name')
    .in('user_id', userIds)

  if (error) throw error
  return data ?? []
}

export type PaidLessonFeeRow = Pick<Lesson, 'id' | 'fee'>

export async function getPaidLessonFees(
  client: SupabaseClient,
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<PaidLessonFeeRow[]> {
  const { data, error } = await client
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
  client: SupabaseClient,
  barnId: string,
  lessonIds: string[]
): Promise<LessonHorseRow[]> {
  const { data, error } = await client
    .from('lesson_horses')
    .select('lesson_id, horse_id')
    .eq('barn_id', barnId)
    .in('lesson_id', lessonIds)

  if (error) throw error
  return data ?? []
}

export type PaidLessonInstructorFeeRow = Pick<Lesson, 'instructor_id' | 'fee'>

export async function getPaidLessonInstructorFees(
  client: SupabaseClient,
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<PaidLessonInstructorFeeRow[]> {
  const { data, error } = await client
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
  client: SupabaseClient,
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<PaidLessonFeeAtRow[]> {
  const { data, error } = await client
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

export interface RiderMembershipRow {
  id: string
  user_id: string | null
}

export async function getRiderMembership(
  client: SupabaseClient,
  barnId: string,
  riderId: string
): Promise<RiderMembershipRow | null> {
  const { data, error } = await client
    .from('barn_memberships')
    .select('id, user_id')
    .eq('barn_id', barnId)
    .eq('id', riderId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export interface ProfileNamePairRow {
  first_name: string
  last_name: string
}

export async function getProfileNameByUserId(
  client: SupabaseClient,
  userId: string
): Promise<ProfileNamePairRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}
