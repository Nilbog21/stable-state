import { createClient } from '@/lib/supabase/server'
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
}): Promise<Lesson> {
  const supabase = await createClient()
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
