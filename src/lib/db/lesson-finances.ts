import { createClient } from '@/lib/supabase/server'
import { resolveMemberNames } from './barn-memberships'
import { resolveHorseNames } from './horses'
import {
  getLessonsForSummary,
  getTierPricesByNames,
  getOutstandingLessonRows,
  getLessonRidersForLessons,
  getProfileNamesByUserIds,
  getPaidLessonFees,
  getLessonHorsesForLessons,
  getPaidLessonInstructorFees,
  getPaidLessonFeesAt,
  getRiderMembership,
  getProfileNameByUserId,
} from './lesson-finance-queries'
import type { FinancialSummary, HorseIncomeDetailRow, HorseIncomeSummary, OutstandingLesson, RiderIncomeDetailRow, RiderIncomeSummary, Role, TrainerIncomeSummary } from './types'

export async function getFinancialSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<FinancialSummary> {
  const supabase = await createClient()
  const now = new Date()

  const lessons = await getLessonsForSummary(supabase, barnId, startDate, endDate)

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
    const tiers = await getTierPricesByNames(supabase, barnId, nonCustomTierNames)
    for (const t of tiers) tierPrices.set(t.name, t.price)
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

  const outstandingRaw = await getOutstandingLessonRows(supabase, barnId, userId, role)

  if (outstandingRaw.length === 0) return []

  const outstandingIds = outstandingRaw.map((l) => l.id)
  const instructorIds = [...new Set(outstandingRaw.map((l) => l.instructor_id).filter((id): id is string => id !== null))]

  const [lessonRiders, profiles] = await Promise.all([
    getLessonRidersForLessons(supabase, barnId, outstandingIds),
    getProfileNamesByUserIds(supabase, instructorIds),
  ])

  const riderIds = [...new Set(lessonRiders.map((lr) => lr.rider_id))]

  const membershipNameMap = await resolveMemberNames(riderIds, barnId, supabase)

  return outstandingRaw.map((lesson) => {
    const profile = profiles.find((p) => p.user_id === lesson.instructor_id)
    const riderJunctionRows = lessonRiders.filter((lr) => lr.lesson_id === lesson.id)
    const rider_names = riderJunctionRows
      .map((lr) => membershipNameMap.get(lr.rider_id))
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

  const lessons = await getPaidLessonFees(supabase, barnId, startDate, endDate)

  const paidLessons = lessons.filter((l): l is { id: string; fee: number } => l.fee !== null)
  if (!paidLessons.length) return []

  const lessonIds = paidLessons.map((l) => l.id)

  const lessonHorses = await getLessonHorsesForLessons(supabase, barnId, lessonIds)

  if (!lessonHorses.length) return []

  const horseIds = [...new Set(lessonHorses.map((lh) => lh.horse_id))]

  const horseNameMap = await resolveHorseNames(horseIds, barnId, supabase)

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
      horseName: horseNameMap.get(horseId) ?? horseId,
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

  const lessons = await getPaidLessonFees(supabase, barnId, startDate, endDate)

  const paidLessons = lessons.filter((l): l is { id: string; fee: number } => l.fee !== null)
  if (!paidLessons.length) return []

  const lessonIds = paidLessons.map((l) => l.id)

  const lessonRiders = await getLessonRidersForLessons(supabase, barnId, lessonIds)

  if (!lessonRiders.length) return []

  const riderIds = [...new Set(lessonRiders.map((lr) => lr.rider_id))]

  const memberNameMap = await resolveMemberNames(riderIds, barnId, supabase)

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
      riderName: memberNameMap.get(riderId) ?? riderId,
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

  const lessons = await getPaidLessonInstructorFees(supabase, barnId, startDate, endDate)

  const collected = lessons.filter(
    (l): l is { instructor_id: string; fee: number } => l.instructor_id !== null && l.fee !== null
  )
  if (!collected.length) return []

  const instructorIds = [...new Set(collected.map((l) => l.instructor_id))]

  const profiles = await getProfileNamesByUserIds(supabase, instructorIds)

  const incomeMap = new Map<string, number>()
  for (const lesson of collected) {
    incomeMap.set(lesson.instructor_id, (incomeMap.get(lesson.instructor_id) ?? 0) + lesson.fee)
  }

  return Array.from(incomeMap.entries())
    .map(([trainerId, totalIncome]) => {
      const profile = profiles.find((p) => p.user_id === trainerId)
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

  const lessonsData = await getPaidLessonFeesAt(supabase, barnId, startDate, endDate)

  const horseNameMap = await resolveHorseNames([horseId], barnId, supabase)
  const horseName = horseNameMap.get(horseId) ?? horseId

  const paidLessons = lessonsData.filter(
    (l): l is { id: string; fee: number; lesson_at: string } => l.fee !== null
  )
  if (!paidLessons.length) return { horseName, rows: [], total: 0 }

  const lessonIds = paidLessons.map((l) => l.id)
  const lessonHorses = await getLessonHorsesForLessons(supabase, barnId, lessonIds)

  const rows: HorseIncomeDetailRow[] = []
  for (const lesson of paidLessons) {
    const participants = lessonHorses.filter((lh) => lh.lesson_id === lesson.id)
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

export async function getRiderIncomeDetail(
  barnId: string,
  riderId: string,
  startDate: Date,
  endDate: Date
): Promise<{ riderName: string; rows: RiderIncomeDetailRow[]; total: number }> {
  const supabase = await createClient()

  const lessonsData = await getPaidLessonFeesAt(supabase, barnId, startDate, endDate)

  const riderData = await getRiderMembership(supabase, barnId, riderId)

  let riderName = riderId
  if (riderData?.user_id) {
    const riderProfile = await getProfileNameByUserId(supabase, riderData.user_id)
    if (riderProfile) riderName = `${riderProfile.first_name} ${riderProfile.last_name}`
  }

  const paidLessons = lessonsData.filter(
    (l): l is { id: string; fee: number; lesson_at: string } => l.fee !== null
  )
  if (!paidLessons.length) return { riderName, rows: [], total: 0 }

  const lessonIds = paidLessons.map((l) => l.id)
  const lessonRiders = await getLessonRidersForLessons(supabase, barnId, lessonIds)

  const rows: RiderIncomeDetailRow[] = []
  for (const lesson of paidLessons) {
    const participants = lessonRiders.filter((lr) => lr.lesson_id === lesson.id)
    if (!participants.some((lr) => lr.rider_id === riderId)) continue
    const riderCount = participants.length
    rows.push({
      lessonId: lesson.id,
      lessonAt: lesson.lesson_at,
      fee: lesson.fee,
      riderCount,
      splitAmount: lesson.fee / riderCount,
    })
  }

  const total = rows.reduce((sum, r) => sum + r.splitAmount, 0)
  return { riderName, rows, total }
}
