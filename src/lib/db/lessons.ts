import { createClient } from '@/lib/supabase/server'
import type { Lesson, LessonDetail, LessonWithDetails, Role } from './types'

async function hydrateParticipants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lessons: Lesson[]
): Promise<LessonWithDetails[]> {
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
    const horseJunctionRows = (lessonHorses ?? []).filter((lh) => lh.lesson_id === lesson.id)
    const horseNames = horseJunctionRows
      .map((lh) => (horses ?? []).find((h) => h.id === lh.horse_id)?.name)
      .filter((name): name is string => Boolean(name))
    const riderJunctionRows = (lessonRiders ?? []).filter((lr) => lr.lesson_id === lesson.id)
    const riderNames = riderJunctionRows
      .map((lr) => (riders ?? []).find((r) => r.id === lr.rider_id)?.name)
      .filter((name): name is string => Boolean(name))
    return {
      ...lesson,
      instructor_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
      horse_names: horseNames,
      horse_count: horseJunctionRows.length,
      rider_names: riderNames,
      rider_count: riderJunctionRows.length,
    }
  })
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

export async function getLessonsByBarn(
  barnId: string,
  userId: string,
  role: 'manager' | 'trainer' | 'rider'
): Promise<LessonWithDetails[]> {
  const supabase = await createClient()

  if (role === 'rider') {
    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('id')
      .eq('barn_id', barnId)
      .eq('user_id', userId)
      .maybeSingle()
    if (riderError) throw riderError
    if (!rider) return []

    const { data: enrollments, error: enrollmentError } = await supabase
      .from('lesson_riders')
      .select('lesson_id')
      .eq('barn_id', barnId)
      .eq('rider_id', rider.id)
    if (enrollmentError) throw enrollmentError
    if (!enrollments?.length) return []

    const lessonIds = enrollments.map((e) => e.lesson_id)
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .in('id', lessonIds)
      .eq('barn_id', barnId)
      .order('lesson_at', { ascending: false })
    if (lessonsError) throw lessonsError
    return hydrateParticipants(supabase, lessons ?? [])
  }

  let query = supabase.from('lessons').select('*').eq('barn_id', barnId)
  if (role === 'trainer') query = query.eq('instructor_id', userId)
  const { data: lessons, error: lessonsError } = await query.order('lesson_at', { ascending: false })
  if (lessonsError) throw lessonsError
  return hydrateParticipants(supabase, lessons)
}

export async function getLessonById(lessonId: string, barnId: string, role: Role = 'trainer', userId?: string): Promise<LessonDetail | null> {
  const supabase = await createClient()
  const riderSelect = role === 'rider'
    ? 'rider_notes, riders ( id, name, user_id )'
    : 'rider_notes, private_notes, riders ( id, name, user_id )'
  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      lesson_horses ( horse_notes, exertion_level, horses ( id, name ) ),
      lesson_riders ( ${riderSelect} )
    `)
    .eq('id', lessonId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  let instructor_name: string | null = null
  if (data.instructor_id) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', data.instructor_id)
      .maybeSingle()
    if (profileError) throw profileError
    if (profile) instructor_name = `${profile.first_name} ${profile.last_name}`
  }

  const base = { ...data, instructor_name }
  if (role === 'rider') {
    return {
      ...base,
      lesson_riders: base.lesson_riders.map((lr: LessonDetail['lesson_riders'][number]) => ({
        ...lr,
        private_notes: null,
        rider_notes: lr.riders?.user_id === userId ? lr.rider_notes : null,
      })),
    } as LessonDetail
  }
  return base as LessonDetail
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

export async function updateLesson(
  lessonId: string,
  barnId: string,
  updates: Partial<Pick<Lesson, 'fee' | 'lesson_at' | 'jumping' | 'lesson_type' | 'payment_type' | 'tier_name'>>
): Promise<Lesson> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .update(updates)
    .eq('id', lessonId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('lesson not found')
  return data
}

export async function getUpcomingLessons(
  barnId: string,
  from: string,
  to: string,
  userId: string,
  role: 'manager' | 'trainer' | 'rider'
): Promise<LessonWithDetails[]> {
  const supabase = await createClient()

  if (role === 'rider') {
    const { data: rider, error: riderError } = await supabase
      .from('riders')
      .select('id')
      .eq('barn_id', barnId)
      .eq('user_id', userId)
      .maybeSingle()
    if (riderError) throw riderError
    if (!rider) return []

    const { data: enrollments, error: enrollmentError } = await supabase
      .from('lesson_riders')
      .select('lesson_id')
      .eq('barn_id', barnId)
      .eq('rider_id', rider.id)
    if (enrollmentError) throw enrollmentError
    if (!enrollments?.length) return []

    const lessonIds = enrollments.map((e) => e.lesson_id)
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .in('id', lessonIds)
      .gte('lesson_at', from)
      .lt('lesson_at', to)
      .order('lesson_at', { ascending: true })
    if (lessonsError) throw lessonsError
    return hydrateParticipants(supabase, lessons)
  }

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .eq('instructor_id', userId)
    .gte('lesson_at', from)
    .lt('lesson_at', to)
    .order('lesson_at', { ascending: true })
  if (lessonsError) throw lessonsError
  return hydrateParticipants(supabase, lessons)
}
