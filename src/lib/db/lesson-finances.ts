import { createClient } from '@/lib/supabase/server'
import type { FinancialSummary, HorseIncomeDetailRow, HorseIncomeSummary, OutstandingLesson, RiderIncomeSummary, Role, TrainerIncomeSummary } from './types'

export async function getFinancialSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<FinancialSummary> {
  const supabase = await createClient()
  const now = new Date()

  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('barn_id', barnId)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())

  if (error) throw error

  const lessons = data ?? []

  const tierMap = new Map<string, { lessonCount: number; subtotal: number }>()
  let collectedIncome = 0
  let pendingIncome = 0

  for (const lesson of lessons) {
    if (lesson.payment_type !== null) {
      if (lesson.fee !== null) {
        collectedIncome += lesson.fee
        const tierName = lesson.tier_name || 'Custom'
        const existing = tierMap.get(tierName) ?? { lessonCount: 0, subtotal: 0 }
        tierMap.set(tierName, { lessonCount: existing.lessonCount + 1, subtotal: existing.subtotal + lesson.fee })
      }
    } else if (new Date(lesson.lesson_at) > now) {
      if (lesson.fee !== null) pendingIncome += lesson.fee
    }
  }

  const nonCustomTierNames = [...tierMap.keys()].filter((n) => n !== 'Custom')
  const tierPrices = new Map<string, number | null>()
  if (nonCustomTierNames.length) {
    const { data: tiers, error: tiersError } = await supabase
      .from('lesson_tiers')
      .select('name, price')
      .eq('barn_id', barnId)
      .in('name', nonCustomTierNames)
    if (tiersError) throw tiersError
    for (const t of tiers ?? []) tierPrices.set(t.name, t.price)
  }

  const breakdown = Array.from(tierMap.entries())
    .map(([tierName, { lessonCount, subtotal }]) => ({
      tierName,
      price: tierName === 'Custom' ? null : (tierPrices.get(tierName) ?? null),
      lessonCount,
      subtotal,
    }))
    .sort((a, b) => a.tierName.localeCompare(b.tierName))

  return { collectedIncome, pendingIncome, breakdown }
}

export async function getOutstandingLessons(barnId: string, userId?: string, role?: Role): Promise<OutstandingLesson[]> {
  const supabase = await createClient()
  const now = new Date()

  type LessonRow = { id: string; barn_id: string; lesson_at: string; instructor_id: string | null; fee: number | null }
  let outstandingRaw: LessonRow[]

  if (role === 'rider' && userId) {
    const { data: rider, error: riderErr } = await supabase
      .from('riders')
      .select('id')
      .eq('barn_id', barnId)
      .eq('user_id', userId)
      .maybeSingle()
    if (riderErr) throw riderErr
    if (!rider) return []

    const { data: riderLessons, error: rlErr } = await supabase
      .from('lesson_riders')
      .select('lesson_id')
      .eq('barn_id', barnId)
      .eq('rider_id', rider.id)
    if (rlErr) throw rlErr
    const lessonIds = (riderLessons ?? []).map((r: { lesson_id: string }) => r.lesson_id)
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
    outstandingRaw = ((data ?? []) as LessonRow[]).filter((l) => l.fee !== 0)
  } else {
    let query = supabase
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
    outstandingRaw = ((data ?? []) as LessonRow[]).filter((l) => l.fee !== 0)
  }

  if (outstandingRaw.length === 0) return []

  const outstandingIds = outstandingRaw.map((l) => l.id)
  const instructorIds = [...new Set(outstandingRaw.map((l) => l.instructor_id).filter((id): id is string => id !== null))]

  const [
    { data: lessonRiders, error: lrError },
    { data: profiles, error: profError },
  ] = await Promise.all([
    supabase.from('lesson_riders').select('lesson_id, rider_id').in('lesson_id', outstandingIds),
    instructorIds.length
      ? supabase.from('profiles').select('user_id, first_name, last_name').in('user_id', instructorIds)
      : Promise.resolve({ data: [] as { user_id: string; first_name: string; last_name: string }[], error: null }),
  ])

  if (lrError) throw lrError
  if (profError) throw profError

  const riderIds = [...new Set((lessonRiders ?? []).map((lr) => lr.rider_id))]

  const { data: riders, error: ridersError } = riderIds.length
    ? await supabase.from('riders').select('id, name').in('id', riderIds)
    : { data: [] as { id: string; name: string }[], error: null }

  if (ridersError) throw ridersError

  return outstandingRaw.map((lesson) => {
    const profile = (profiles ?? []).find((p) => p.user_id === lesson.instructor_id)
    const riderJunctionRows = (lessonRiders ?? []).filter((lr) => lr.lesson_id === lesson.id)
    const rider_names = riderJunctionRows
      .map((lr) => (riders ?? []).find((r) => r.id === lr.rider_id)?.name)
      .filter((name): name is string => Boolean(name))
    return {
      id: lesson.id,
      barn_id: lesson.barn_id,
      lesson_at: lesson.lesson_at,
      instructor_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
      rider_names,
      fee: lesson.fee,
    }
  })
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
    .not('payment_type', 'is', null)
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
    .not('payment_type', 'is', null)
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

export async function getTrainerIncomeSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<TrainerIncomeSummary[]> {
  const supabase = await createClient()

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('instructor_id, fee')
    .eq('barn_id', barnId)
    .not('payment_type', 'is', null)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())

  if (lessonsError) throw lessonsError

  const collected = (lessons ?? []).filter(
    (l): l is { instructor_id: string; fee: number } => l.instructor_id !== null && l.fee !== null
  )
  if (!collected.length) return []

  const instructorIds = [...new Set(collected.map((l) => l.instructor_id))]

  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .in('user_id', instructorIds)

  if (profError) throw profError

  const incomeMap = new Map<string, number>()
  for (const lesson of collected) {
    incomeMap.set(lesson.instructor_id, (incomeMap.get(lesson.instructor_id) ?? 0) + lesson.fee)
  }

  return Array.from(incomeMap.entries())
    .map(([trainerId, totalIncome]) => {
      const profile = (profiles ?? []).find((p) => p.user_id === trainerId)
      return {
        trainerId,
        trainerName: profile ? `${profile.first_name} ${profile.last_name}` : trainerId,
        totalIncome,
      }
    })
    .sort((a, b) => b.totalIncome - a.totalIncome)
}

export async function getHorseIncomeDetail(
  barnId: string,
  horseId: string,
  startDate: Date,
  endDate: Date
): Promise<{ horseName: string; rows: HorseIncomeDetailRow[]; total: number }> {
  const supabase = await createClient()

  const { data: lessonsData, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, fee, lesson_at')
    .eq('barn_id', barnId)
    .not('payment_type', 'is', null)
    .gte('lesson_at', startDate.toISOString())
    .lt('lesson_at', endDate.toISOString())
    .order('lesson_at', { ascending: true })

  if (lessonsError) throw lessonsError

  const { data: horseData, error: horseError } = await supabase
    .from('horses')
    .select('id, name')
    .eq('id', horseId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (horseError) throw horseError
  const horseName = horseData?.name ?? horseId

  const paidLessons = (lessonsData ?? []).filter(
    (l): l is { id: string; fee: number; lesson_at: string } => l.fee !== null
  )
  if (!paidLessons.length) return { horseName, rows: [], total: 0 }

  const lessonIds = paidLessons.map((l) => l.id)
  const { data: lessonHorses, error: lhError } = await supabase
    .from('lesson_horses')
    .select('lesson_id, horse_id')
    .in('lesson_id', lessonIds)

  if (lhError) throw lhError

  const rows: HorseIncomeDetailRow[] = []
  for (const lesson of paidLessons) {
    const participants = (lessonHorses ?? []).filter((lh) => lh.lesson_id === lesson.id)
    if (!participants.some((lh) => lh.horse_id === horseId)) continue
    const horseCount = participants.length
    rows.push({
      lessonId: lesson.id,
      lessonAt: lesson.lesson_at,
      fee: lesson.fee,
      horseCount,
      splitAmount: lesson.fee / horseCount,
    })
  }

  const total = rows.reduce((sum, r) => sum + r.splitAmount, 0)
  return { horseName, rows, total }
}
