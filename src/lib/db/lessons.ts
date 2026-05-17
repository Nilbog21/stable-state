import { createClient } from '@/lib/supabase/server'
import type { Lesson, LessonHorse, LessonRider } from './types'

export async function createLesson({
  barnId,
  instructorId,
  fee,
  lessonAt,
}: {
  barnId: string
  instructorId: string | null
  fee: number | null
  lessonAt: string
}): Promise<Lesson> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .insert({ barn_id: barnId, instructor_id: instructorId, fee, lesson_at: lessonAt })
    .select()
    .single()

  if (error) throw error
  return data
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
