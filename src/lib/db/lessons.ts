import { createClient } from '@/lib/supabase/server'
import type { Lesson, LessonHorse, LessonRider, LessonWithDetails } from './types'

export async function getLessonsByBarn(barnId: string): Promise<LessonWithDetails[]> {
  const supabase = await createClient()
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .order('lesson_at', { ascending: true })

  if (lessonsError) throw lessonsError
  if (!lessons.length) return []

  const lessonIds = lessons.map((l) => l.id)
  const instructorIds = [...new Set(lessons.map((l) => l.instructor_id).filter(Boolean))] as string[]

  const [
    { data: lessonHorses, error: lessonHorsesError },
    { data: lessonRiders, error: lessonRidersError },
  ] = await Promise.all([
    supabase.from('lesson_horses').select('lesson_id, horse_id').in('lesson_id', lessonIds),
    supabase.from('lesson_riders').select('lesson_id, rider_id').in('lesson_id', lessonIds),
  ])

  if (lessonHorsesError) throw lessonHorsesError
  if (lessonRidersError) throw lessonRidersError

  const horseIds = [...new Set((lessonHorses ?? []).map((lh) => lh.horse_id))]
  const riderIds = [...new Set((lessonRiders ?? []).map((lr) => lr.rider_id))]

  const [
    { data: horses, error: horsesError },
    { data: riders, error: ridersError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    horseIds.length
      ? supabase.from('horses').select('id, name').in('id', horseIds)
      : Promise.resolve({ data: [], error: null }),
    riderIds.length
      ? supabase.from('riders').select('id, name').in('id', riderIds)
      : Promise.resolve({ data: [], error: null }),
    instructorIds.length
      ? supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', instructorIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (horsesError) throw horsesError
  if (ridersError) throw ridersError
  if (profilesError) throw profilesError

  return lessons.map((lesson) => {
    const profile = (profiles ?? []).find((p) => p.user_id === lesson.instructor_id)
    const horseNames = (lessonHorses ?? [])
      .filter((lh) => lh.lesson_id === lesson.id)
      .map((lh) => (horses ?? []).find((h) => h.id === lh.horse_id)?.name)
      .filter((name): name is string => Boolean(name))
    const riderRow = (lessonRiders ?? []).find((lr) => lr.lesson_id === lesson.id)
    const riderName = riderRow ? ((riders ?? []).find((r) => r.id === riderRow.rider_id)?.name ?? null) : null
    return {
      ...lesson,
      instructor_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
      horse_names: horseNames,
      rider_name: riderName,
    }
  })
}

export async function deleteLesson(lessonId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId)
    .eq('barn_id', barnId)

  if (error) throw error
}

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
