import { createClient } from '@/lib/supabase/server'
import type { FinancialSummary, HorseIncomeSummary, RiderIncomeSummary, Lesson, LessonDetail, LessonHorse, LessonRider, LessonType, LessonWithDetails } from './types'

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
  })
  if (error) throw error
  return data as Lesson
}

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

export async function getLessonById(lessonId: string, barnId: string): Promise<LessonDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      profiles ( first_name, last_name ),
      lesson_horses ( exertion_level, horses ( id, name ) ),
      lesson_riders ( riders ( id, name ) )
    `)
    .eq('id', lessonId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (error) throw error
  return data
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

export async function getFinancialSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<FinancialSummary> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lessons')
    .select('fee')
    .eq('barn_id', barnId)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())

  if (error) throw error

  const fees = (data ?? []).map((row) => row.fee).filter((fee): fee is number => fee !== null)

  const tierMap = new Map<number, number>()
  for (const fee of fees) {
    tierMap.set(fee, (tierMap.get(fee) ?? 0) + 1)
  }

  const breakdown = Array.from(tierMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([fee, lessonCount]) => ({ fee, lessonCount, subtotal: fee * lessonCount }))

  const totalIncome = breakdown.reduce((sum, tier) => sum + tier.subtotal, 0)

  return { totalIncome, breakdown }
}

export async function getHorseIncomeSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<HorseIncomeSummary[]> {
  const supabase = await createClient()

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, fee')
    .eq('barn_id', barnId)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())

  if (lessonsError) throw lessonsError

  const paidLessons = (lessons ?? []).filter((l): l is { id: string; fee: number } => l.fee !== null)
  if (!paidLessons.length) return []

  const lessonIds = paidLessons.map((l) => l.id)

  const { data: lessonHorses, error: lhError } = await supabase
    .from('lesson_horses')
    .select('lesson_id, horse_id')
    .in('lesson_id', lessonIds)

  if (lhError) throw lhError

  if (!(lessonHorses ?? []).length) return []

  const horseIds = [...new Set(lessonHorses.map((lh) => lh.horse_id))]

  const { data: horses, error: horsesError } = await supabase
    .from('horses')
    .select('id, name')
    .in('id', horseIds)

  if (horsesError) throw horsesError

  const incomeMap = new Map<string, number>()

  for (const lesson of paidLessons) {
    const participants = lessonHorses.filter((lh) => lh.lesson_id === lesson.id)
    if (!participants.length) continue
    const split = lesson.fee / participants.length
    for (const { horse_id } of participants) {
      incomeMap.set(horse_id, (incomeMap.get(horse_id) ?? 0) + split)
    }
  }

  return Array.from(incomeMap.entries())
    .map(([horseId, totalIncome]) => ({
      horseId,
      horseName: (horses ?? []).find((h) => h.id === horseId)?.name ?? horseId,
      totalIncome,
    }))
    .sort((a, b) => b.totalIncome - a.totalIncome)
}

export async function getRiderIncomeSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<RiderIncomeSummary[]> {
  const supabase = await createClient()

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, fee')
    .eq('barn_id', barnId)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())

  if (lessonsError) throw lessonsError

  const paidLessons = (lessons ?? []).filter((l): l is { id: string; fee: number } => l.fee !== null)
  if (!paidLessons.length) return []

  const lessonIds = paidLessons.map((l) => l.id)

  const { data: lessonRiders, error: lrError } = await supabase
    .from('lesson_riders')
    .select('lesson_id, rider_id')
    .in('lesson_id', lessonIds)

  if (lrError) throw lrError

  if (!(lessonRiders ?? []).length) return []

  const riderIds = [...new Set(lessonRiders.map((lr) => lr.rider_id))]

  const { data: riders, error: ridersError } = await supabase
    .from('riders')
    .select('id, name')
    .in('id', riderIds)

  if (ridersError) throw ridersError

  const incomeMap = new Map<string, number>()

  for (const lesson of paidLessons) {
    const participants = lessonRiders.filter((lr) => lr.lesson_id === lesson.id)
    if (!participants.length) continue
    const split = lesson.fee / participants.length
    for (const { rider_id } of participants) {
      incomeMap.set(rider_id, (incomeMap.get(rider_id) ?? 0) + split)
    }
  }

  return Array.from(incomeMap.entries())
    .map(([riderId, totalIncome]) => ({
      riderId,
      riderName: (riders ?? []).find((r) => r.id === riderId)?.name ?? riderId,
      totalIncome,
    }))
    .sort((a, b) => b.totalIncome - a.totalIncome)
}

export async function getUpcomingLessons(
  barnId: string,
  from: string,
  to: string
): Promise<LessonWithDetails[]> {
  const supabase = await createClient()
  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .gte('lesson_at', from)
    .lt('lesson_at', to)
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
