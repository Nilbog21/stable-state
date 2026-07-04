import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lesson, LessonHorse, LessonRider, LessonType, PaymentType } from './types'

export async function createLessonWithParticipants(params: {
  barnId: string
  instructorId: string | null
  lessonAt: string
  fee: number | null
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
  fee: number | null
  lessonType: LessonType
  jumping: boolean
  paymentType: PaymentType | null
  tierName: string
  horseIds: string[]
  exertionLevels: number[]
  riderIds: string[]
}): Promise<Lesson> {
  const supabase = await createClient()
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

export async function addHorseToLesson(
  lessonId: string,
  horseId: string,
  barnId: string,
  exertionLevel = 3
): Promise<LessonHorse> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_horses')
    .insert({ lesson_id: lessonId, horse_id: horseId, barn_id: barnId, exertion_level: exertionLevel })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addRiderToLesson(
  lessonId: string,
  riderId: string,
  barnId: string
): Promise<LessonRider> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_riders')
    .insert({ lesson_id: lessonId, rider_id: riderId, barn_id: barnId })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateLessonRiderNotes(
  lessonId: string,
  riderId: string,
  barnId: string,
  riderNotes: string | null,
  privateNotes: string | null
): Promise<LessonRider> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_riders')
    .update({ rider_notes: riderNotes, private_notes: privateNotes })
    .eq('lesson_id', lessonId)
    .eq('rider_id', riderId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateLessonHorseNotes(
  lessonId: string,
  horseId: string,
  barnId: string,
  horseNotes: string | null
): Promise<LessonHorse> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_horses')
    .update({ horse_notes: horseNotes })
    .eq('lesson_id', lessonId)
    .eq('horse_id', horseId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function cancelRiderParticipation(
  lessonId: string,
  barnId: string,
  riderId: string,
  notes: string | null | undefined,
  isLate: boolean
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_rider_participation', {
    p_lesson_id: lessonId,
    p_barn_id: barnId,
    p_rider_id: riderId,
    p_notes: notes ?? null,
    p_is_late: isLate,
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
