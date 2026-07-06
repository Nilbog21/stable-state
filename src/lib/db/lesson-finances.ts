import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './barn-memberships'
import { resolveHorseNames } from './horses'
import {
  getLessonsForSummary,
  getTierPricesByNames,
  getOutstandingLessonRows,
  getLessonRidersForLessons,
  getPaidLessonFees,
  getLessonHorsesForLessons,
  getPaidLessonInstructorFees,
  getPaidLessonFeesAt,
  getRiderMembership,
  getProfileNameByUserId,
} from './lesson-finance-queries'
import { getChargesForSummary, getPaidCharges } from './agreements'
import type {
  FinancialSummary,
  HorseChargeDetailRow,
  HorseIncomeDetailRow,
  HorseIncomeSummary,
  OutstandingCharge,
  OutstandingItem,
  OutstandingLesson,
  RiderChargeDetailRow,
  RiderIncomeDetailRow,
  RiderIncomeSummary,
  Role,
  TrainerIncomeSummary,
} from './types'

export const NON_LESSON_INCOME_LABEL = 'Non-lesson income'

export function mergeOutstandingItems(lessons: OutstandingLesson[], charges: OutstandingCharge[]): OutstandingItem[] {
  const lessonItems: OutstandingItem[] = lessons.map((l) => ({
    id: l.id,
    itemType: 'lesson',
    date: l.lesson_at,
    instructorName: l.instructor_name,
    riderNames: l.rider_names,
    fee: l.fee,
  }))
  const chargeItems: OutstandingItem[] = charges.map((c) => ({
    id: c.id,
    itemType: c.kind,
    date: c.period,
    instructorName: null,
    riderNames: [c.riderName],
    fee: c.fee,
  }))
  return [...lessonItems, ...chargeItems].sort((a, b) => a.date.localeCompare(b.date))
}

export async function getFinancialSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<FinancialSummary> {
  const supabase = await createClient()
  const now = new Date()

  const [lessons, charges] = await Promise.all([
    getLessonsForSummary(supabase, barnId, startDate, endDate),
    getChargesForSummary(barnId, startDate, endDate, supabase),
  ])

  const tierMap = new Map<string, { lessonCount: number; subtotal: number }>()
  let collectedIncome = 0
  let pendingIncome = 0

  for (const lesson of lessons) {
    if (lesson.payment_type !== null) {
      collectedIncome += lesson.fee
      const tierName = lesson.tier_name || 'Custom'
      const existing = tierMap.get(tierName) ?? { lessonCount: 0, subtotal: 0 }
      tierMap.set(tierName, { lessonCount: existing.lessonCount + 1, subtotal: existing.subtotal + lesson.fee })
    } else if (new Date(lesson.lesson_at) > now) {
      pendingIncome += lesson.fee
    }
  }

  const firstOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)

  let chargesCollected = 0
  let chargesCount = 0
  for (const charge of charges) {
    if (charge.payment_type !== null) {
      chargesCollected += charge.fee
      chargesCount += 1
    } else if (charge.period >= firstOfCurrentMonth) {
      pendingIncome += charge.fee
    }
  }
  collectedIncome += chargesCollected

  const nonCustomTierNames = [...tierMap.keys()].filter((n) => n !== 'Custom')
  const tierPrices = new Map<string, number>()
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

  if (chargesCount > 0) {
    breakdown.push({ tierName: NON_LESSON_INCOME_LABEL, price: null, lessonCount: chargesCount, subtotal: chargesCollected })
  }

  return { collectedIncome, pendingIncome, breakdown }
}

export async function getOutstandingLessons(
  barnId: string,
  userId?: string,
  role?: Role,
  client?: SupabaseClient
): Promise<OutstandingLesson[]> {
  const supabase = client ?? await createClient()

  const outstandingRaw = await getOutstandingLessonRows(supabase, barnId, userId, role)

  if (outstandingRaw.length === 0) return []

  const outstandingIds = outstandingRaw.map((l) => l.id)
  const instructorIds = [...new Set(outstandingRaw.map((l) => l.instructor_id).filter((id): id is string => id !== null))]

  const lessonRiders = await getLessonRidersForLessons(supabase, barnId, outstandingIds)

  const riderIds = [...new Set(lessonRiders.map((lr) => lr.rider_id))]

  const membershipNameMap = await resolveMemberNames([...riderIds, ...instructorIds], barnId, supabase)

  return outstandingRaw.map((lesson) => {
    const riderJunctionRows = lessonRiders.filter((lr) => lr.lesson_id === lesson.id)
    const rider_names = riderJunctionRows
      .map((lr) => membershipNameMap.get(lr.rider_id))
      .filter((name): name is string => Boolean(name))
    return {
      id: lesson.id,
      barn_id: lesson.barn_id,
      lesson_at: lesson.lesson_at,
      instructor_name: lesson.instructor_id ? membershipNameMap.get(lesson.instructor_id) ?? null : null,
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

  const [lessons, charges] = await Promise.all([
    getPaidLessonFees(supabase, barnId, startDate, endDate),
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])

  const incomeMap = new Map<string, number>()

  if (lessons.length) {
    const lessonIds = lessons.map((l) => l.id)
    const lessonHorses = await getLessonHorsesForLessons(supabase, barnId, lessonIds)
    for (const lesson of lessons) {
      const participants = lessonHorses.filter((lh) => lh.lesson_id === lesson.id)
      if (!participants.length) continue
      const split = lesson.fee / participants.length
      for (const { horse_id } of participants) {
        incomeMap.set(horse_id, (incomeMap.get(horse_id) ?? 0) + split)
      }
    }
  }

  for (const charge of charges) {
    incomeMap.set(charge.horseId, (incomeMap.get(charge.horseId) ?? 0) + charge.fee)
  }

  if (!incomeMap.size) return []

  const horseIds = [...incomeMap.keys()]
  const horseNameMap = await resolveHorseNames(horseIds, barnId, supabase)

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

  const [lessons, charges] = await Promise.all([
    getPaidLessonFees(supabase, barnId, startDate, endDate),
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])

  const incomeMap = new Map<string, number>()

  if (lessons.length) {
    const lessonIds = lessons.map((l) => l.id)
    const lessonRiders = await getLessonRidersForLessons(supabase, barnId, lessonIds)
    for (const lesson of lessons) {
      const participants = lessonRiders.filter((lr) => lr.lesson_id === lesson.id)
      if (!participants.length) continue
      const split = lesson.fee / participants.length
      for (const { rider_id } of participants) {
        incomeMap.set(rider_id, (incomeMap.get(rider_id) ?? 0) + split)
      }
    }
  }

  for (const charge of charges) {
    incomeMap.set(charge.riderId, (incomeMap.get(charge.riderId) ?? 0) + charge.fee)
  }

  if (!incomeMap.size) return []

  const riderIds = [...incomeMap.keys()]
  const memberNameMap = await resolveMemberNames(riderIds, barnId, supabase)

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

  const [lessons, charges] = await Promise.all([
    getPaidLessonInstructorFees(supabase, barnId, startDate, endDate),
    getChargesForSummary(barnId, startDate, endDate, supabase),
  ])

  const collected = lessons.filter(
    (l): l is { instructor_id: string; fee: number } => l.instructor_id !== null
  )

  let result: TrainerIncomeSummary[] = []

  if (collected.length) {
    const instructorIds = [...new Set(collected.map((l) => l.instructor_id))]
    const memberNameMap = await resolveMemberNames(instructorIds, barnId, supabase)

    const incomeMap = new Map<string, number>()
    for (const lesson of collected) {
      incomeMap.set(lesson.instructor_id, (incomeMap.get(lesson.instructor_id) ?? 0) + lesson.fee)
    }

    result = Array.from(incomeMap.entries())
      .map(([trainerId, totalIncome]) => ({
        trainerId,
        trainerName: memberNameMap.get(trainerId) ?? trainerId,
        totalIncome,
      }))
      .sort((a, b) => b.totalIncome - a.totalIncome)
  }

  const chargesCollected = charges.filter((c) => c.payment_type !== null).reduce((sum, c) => sum + c.fee, 0)
  if (chargesCollected > 0) {
    result.push({ trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: chargesCollected })
  }

  return result
}

export async function getHorseIncomeDetail(
  barnId: string,
  horseId: string,
  startDate: Date,
  endDate: Date
): Promise<{ horseName: string; rows: HorseIncomeDetailRow[]; chargeRows: HorseChargeDetailRow[]; total: number }> {
  const supabase = await createClient()

  const [lessonsData, charges] = await Promise.all([
    getPaidLessonFeesAt(supabase, barnId, startDate, endDate),
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])

  const horseNameMap = await resolveHorseNames([horseId], barnId, supabase)
  const horseName = horseNameMap.get(horseId) ?? horseId

  const rows: HorseIncomeDetailRow[] = []
  if (lessonsData.length) {
    const lessonIds = lessonsData.map((l) => l.id)
    const lessonHorses = await getLessonHorsesForLessons(supabase, barnId, lessonIds)
    for (const lesson of lessonsData) {
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
  }

  const chargeRows: HorseChargeDetailRow[] = charges
    .filter((c) => c.horseId === horseId)
    .map((c) => ({ chargeId: c.chargeId, agreementId: c.agreementId, period: c.period, kind: c.kind, fee: c.fee }))

  const total = rows.reduce((sum, r) => sum + r.splitAmount, 0) + chargeRows.reduce((sum, r) => sum + r.fee, 0)
  return { horseName, rows, chargeRows, total }
}

export async function getRiderIncomeDetail(
  barnId: string,
  riderId: string,
  startDate: Date,
  endDate: Date
): Promise<{ riderName: string; rows: RiderIncomeDetailRow[]; chargeRows: RiderChargeDetailRow[]; total: number }> {
  const supabase = await createClient()

  const [lessonsData, charges] = await Promise.all([
    getPaidLessonFeesAt(supabase, barnId, startDate, endDate),
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])

  const riderData = await getRiderMembership(supabase, barnId, riderId)

  let riderName = riderId
  if (riderData?.user_id) {
    const riderProfile = await getProfileNameByUserId(supabase, riderData.user_id)
    if (riderProfile) riderName = `${riderProfile.first_name} ${riderProfile.last_name}`
  }

  const rows: RiderIncomeDetailRow[] = []
  if (lessonsData.length) {
    const lessonIds = lessonsData.map((l) => l.id)
    const lessonRiders = await getLessonRidersForLessons(supabase, barnId, lessonIds)
    for (const lesson of lessonsData) {
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
  }

  const chargeRows: RiderChargeDetailRow[] = charges
    .filter((c) => c.riderId === riderId)
    .map((c) => ({ chargeId: c.chargeId, agreementId: c.agreementId, period: c.period, kind: c.kind, fee: c.fee }))

  const total = rows.reduce((sum, r) => sum + r.splitAmount, 0) + chargeRows.reduce((sum, r) => sum + r.fee, 0)
  return { riderName, rows, chargeRows, total }
}
