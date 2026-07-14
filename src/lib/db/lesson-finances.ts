import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './barn-memberships'
import { resolveHorseNames } from './horses'
import {
  getLessonsForSummary,
  getTierPricesByNames,
  getOutstandingLessonRows,
  getLessonJunctionRows,
  getPaidLessonRows,
} from './lesson-finance-queries'
import { getChargesForSummary, getPaidCharges } from './agreements'
import { getTiersByBarn } from './lesson-tiers'
import type {
  FinancialSummary,
  HorseChargeDetailRow,
  HorseExpenseSummary,
  HorseIncomeDetailRow,
  HorseIncomeSummary,
  HorseNetIncomeRow,
  OutstandingCharge,
  OutstandingItem,
  OutstandingLesson,
  RiderChargeDetailRow,
  RiderIncomeDetailRow,
  RiderIncomeSummary,
  Role,
  TrainerIncomeDetailRow,
  TrainerIncomeSummary,
} from './types'
import type { ChargeSummaryRow } from './agreements'

export function splitNetFee(
  fee: number,
  instructorCut: number,
  participantCount: number
): { netFee: number; splitAmount: number } {
  const netFee = fee - instructorCut
  return { netFee, splitAmount: netFee / participantCount }
}

export const NON_LESSON_INCOME_LABEL = 'Non-lesson income'
export const NO_INSTRUCTOR_LABEL = 'No instructor'
export const NO_HORSE_LABEL = 'No horse'
export const NO_RIDER_LABEL = 'No rider'

/**
 * Shared fold+cut+fallback pipeline: nets each row's own snapshotted instructor_cut
 * once, splits the remainder across `key(row)`'s participant keys, and accumulates
 * rows with no keys under `fallbackLabel` instead of splitting. Single source of
 * cut-subtraction (via splitNetFee) and of "no participant" fallback accumulation
 * for all summary adapters below. The cut is read from each row rather than taken
 * as a shared parameter, since it's snapshotted per lesson at creation time.
 */
export function computeGroupedIncome<T extends { fee: number; instructor_cut: number }>(
  rows: T[],
  key: (row: T) => string[],
  fallbackLabel: string
): Map<string, { total: number; count: number }> {
  const grouped = new Map<string, { total: number; count: number }>()
  const add = (k: string, amount: number) => {
    const existing = grouped.get(k) ?? { total: 0, count: 0 }
    grouped.set(k, { total: existing.total + amount, count: existing.count + 1 })
  }

  for (const row of rows) {
    const keys = key(row)
    const { netFee, splitAmount } = splitNetFee(row.fee, row.instructor_cut, keys.length || 1)
    if (!keys.length) {
      add(fallbackLabel, netFee)
      continue
    }
    for (const k of keys) add(k, splitAmount)
  }

  return grouped
}

/**
 * Resolves names and sorts a grouped map descending by total, always appending the
 * fallback row (if present) last regardless of its value — the fallback is never
 * part of the value-sort, matching the pre-refactor behavior where it was pushed
 * after `.sort()`.
 */
function toSortedIncomeRows(
  grouped: Map<string, { total: number; count: number }>,
  fallbackLabel: string,
  nameMap: Map<string, string>
): { id: string; name: string; totalIncome: number }[] {
  const fallback = grouped.get(fallbackLabel)
  const sorted = [...grouped.entries()]
    .filter(([id]) => id !== fallbackLabel)
    .map(([id, { total }]) => ({ id, name: nameMap.get(id) ?? id, totalIncome: total }))
    .sort((a, b) => b.totalIncome - a.totalIncome)

  if (fallback) sorted.push({ id: fallbackLabel, name: fallbackLabel, totalIncome: fallback.total })

  return sorted
}

/** Single source of the NON_LESSON_INCOME_LABEL synthetic row's count/total math. */
function foldChargesCollected(charges: Pick<ChargeSummaryRow, 'fee' | 'payment_type'>[]): { count: number; total: number } {
  const paid = charges.filter((c) => c.payment_type !== null)
  return { count: paid.length, total: paid.reduce((sum, c) => sum + c.fee, 0) }
}

/** Shared body for getHorseIncomeDetail/getRiderIncomeDetail — per-lesson rows for a single target participant. */
function computeDetailRows<P>(
  lessons: { id: string; fee: number; lesson_at: string; instructor_cut: number }[],
  participantsByLessonId: (lessonId: string) => P[],
  getParticipantKey: (p: P) => string,
  targetId: string
): { lessonId: string; lessonAt: string; fee: number; count: number; splitAmount: number }[] {
  const rows: { lessonId: string; lessonAt: string; fee: number; count: number; splitAmount: number }[] = []

  for (const lesson of lessons) {
    const participants = participantsByLessonId(lesson.id)
    if (!participants.some((p) => getParticipantKey(p) === targetId)) continue
    const count = participants.length
    const { netFee, splitAmount } = splitNetFee(lesson.fee, lesson.instructor_cut, count)
    rows.push({ lessonId: lesson.id, lessonAt: lesson.lesson_at, fee: netFee, count, splitAmount })
  }

  return rows
}

export function computeHorseNetIncome(
  horseIncome: HorseIncomeSummary[],
  expenseBreakdown: HorseExpenseSummary[]
): HorseNetIncomeRow[] {
  const expenseByHorse = new Map(expenseBreakdown.map((e) => [e.horseId, e]))
  const incomeByHorse = new Map(horseIncome.map((h) => [h.horseId, h]))

  return [...new Set([...incomeByHorse.keys(), ...expenseByHorse.keys()])]
    .map((horseId) => {
      const income = incomeByHorse.get(horseId)
      const expenses = expenseByHorse.get(horseId)
      return {
        horseId,
        // horseId always comes from one of the two maps' keys, so this is never undefined
        horseName: (income ?? expenses)!.horseName,
        income: income?.totalIncome ?? 0,
        expenses: expenses?.totalExpenses ?? 0,
        net: (income?.totalIncome ?? 0) - (expenses?.totalExpenses ?? 0),
      }
    })
    .sort((a, b) => b.income - a.income || a.horseName.localeCompare(b.horseName))
}

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

  const [lessons, charges, activeTiers] = await Promise.all([
    getLessonsForSummary(barnId, startDate, endDate, supabase),
    getChargesForSummary(barnId, startDate, endDate, supabase),
    getTiersByBarn(barnId),
  ])

  const paidLessons = lessons.filter((l) => l.payment_type !== null)
  const tierGroups = computeGroupedIncome(paidLessons, (l) => [l.tier_name || 'Custom'], 'Custom')

  let collectedIncome = 0
  for (const { total } of tierGroups.values()) collectedIncome += total

  let pendingIncome = lessons
    .filter((l) => l.payment_type === null && new Date(l.lesson_at) > now)
    .reduce((sum, l) => sum + splitNetFee(l.fee, l.instructor_cut, 1).netFee, 0)

  const firstOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)

  pendingIncome += charges
    .filter((c) => c.payment_type === null && c.period >= firstOfCurrentMonth)
    .reduce((sum, c) => sum + c.fee, 0)

  const chargesFold = foldChargesCollected(charges)
  collectedIncome += chargesFold.total

  const nonCustomTierNames = [...tierGroups.keys()].filter((n) => n !== 'Custom')
  const tierPrices = new Map<string, number>()
  if (nonCustomTierNames.length) {
    const tiers = await getTierPricesByNames(barnId, nonCustomTierNames, supabase)
    for (const t of tiers) tierPrices.set(t.name, t.price)
  }

  // Sum of each tier group's own paid lessons' snapshotted instructor_cut — tier
  // grouping is always exactly one key per lesson, so this is a direct sum with
  // no split/double-count risk, unlike the by-horse/rider groupings above.
  const cutByTier = new Map<string, number>()
  for (const l of paidLessons) {
    const t = l.tier_name || 'Custom'
    cutByTier.set(t, (cutByTier.get(t) ?? 0) + l.instructor_cut)
  }

  // Active tiers with no paid lessons this month still get a $0 row, so the full
  // current tier list is visible at a glance rather than only tiers that billed.
  const zeroTierRows = activeTiers
    .filter((t) => !tierGroups.has(t.name))
    .map((t) => ({ tierName: t.name, price: t.price, lessonCount: 0, subtotal: 0, instructorCut: 0 }))

  const breakdown = [
    ...Array.from(tierGroups.entries()).map(([tierName, { count, total }]) => ({
      tierName,
      price: tierName === 'Custom' ? null : (tierPrices.get(tierName) ?? null),
      lessonCount: count,
      subtotal: total,
      // tierGroups and cutByTier are both built from paidLessons with the same
      // tier_name || 'Custom' key, so every tierGroups key has a cutByTier entry.
      instructorCut: cutByTier.get(tierName)!,
    })),
    ...zeroTierRows,
  ].sort((a, b) => a.tierName.localeCompare(b.tierName))

  if (chargesFold.count > 0) {
    breakdown.push({ tierName: NON_LESSON_INCOME_LABEL, price: null, lessonCount: chargesFold.count, subtotal: chargesFold.total, instructorCut: 0 })
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

  const outstandingRaw = await getOutstandingLessonRows(barnId, userId, role, supabase)

  if (outstandingRaw.length === 0) return []

  const outstandingIds = outstandingRaw.map((l) => l.id)
  const instructorIds = [...new Set(outstandingRaw.map((l) => l.instructor_id).filter((id): id is string => id !== null))]

  const lessonRiders = await getLessonJunctionRows('lesson_riders', 'rider_id', barnId, outstandingIds, supabase)

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
    getPaidLessonRows(barnId, startDate, endDate, ['id'], supabase) as Promise<{ id: string; fee: number; instructor_cut: number }[]>,
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])

  let grouped = new Map<string, { total: number; count: number }>()
  if (lessons.length) {
    const lessonIds = lessons.map((l) => l.id)
    const lessonHorses = await getLessonJunctionRows('lesson_horses', 'horse_id', barnId, lessonIds, supabase)
    grouped = computeGroupedIncome(
      lessons,
      (l) => lessonHorses.filter((lh) => lh.lesson_id === l.id).map((lh) => lh.horse_id),
      NO_HORSE_LABEL
    )
  }

  for (const charge of charges) {
    const existing = grouped.get(charge.horseId) ?? { total: 0, count: 0 }
    grouped.set(charge.horseId, { total: existing.total + charge.fee, count: existing.count + 1 })
  }

  if (!grouped.size) return []

  const horseIds = [...grouped.keys()].filter((id) => id !== NO_HORSE_LABEL)
  const horseNameMap = await resolveHorseNames(horseIds, barnId, supabase)

  return toSortedIncomeRows(grouped, NO_HORSE_LABEL, horseNameMap).map((r) => ({
    horseId: r.id,
    horseName: r.name,
    totalIncome: r.totalIncome,
  }))
}

export async function getRiderIncomeSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<RiderIncomeSummary[]> {
  const supabase = await createClient()

  const [lessons, charges] = await Promise.all([
    getPaidLessonRows(barnId, startDate, endDate, ['id'], supabase) as Promise<{ id: string; fee: number; instructor_cut: number }[]>,
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])

  let grouped = new Map<string, { total: number; count: number }>()
  if (lessons.length) {
    const lessonIds = lessons.map((l) => l.id)
    const lessonRiders = await getLessonJunctionRows('lesson_riders', 'rider_id', barnId, lessonIds, supabase)
    grouped = computeGroupedIncome(
      lessons,
      (l) => lessonRiders.filter((lr) => lr.lesson_id === l.id).map((lr) => lr.rider_id),
      NO_RIDER_LABEL
    )
  }

  for (const charge of charges) {
    const existing = grouped.get(charge.riderId) ?? { total: 0, count: 0 }
    grouped.set(charge.riderId, { total: existing.total + charge.fee, count: existing.count + 1 })
  }

  if (!grouped.size) return []

  const riderIds = [...grouped.keys()].filter((id) => id !== NO_RIDER_LABEL)
  const memberNameMap = await resolveMemberNames(riderIds, barnId, supabase)

  return toSortedIncomeRows(grouped, NO_RIDER_LABEL, memberNameMap).map((r) => ({
    riderId: r.id,
    riderName: r.name,
    totalIncome: r.totalIncome,
  }))
}

export async function getTrainerIncomeSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<TrainerIncomeSummary[]> {
  const supabase = await createClient()

  const [lessons, charges] = await Promise.all([
    getPaidLessonRows(barnId, startDate, endDate, ['instructor_id'], supabase) as Promise<
      { instructor_id: string | null; fee: number; instructor_cut: number }[]
    >,
    getChargesForSummary(barnId, startDate, endDate, supabase),
  ])

  const grouped = computeGroupedIncome(
    lessons,
    (l) => (l.instructor_id ? [l.instructor_id] : []),
    NO_INSTRUCTOR_LABEL
  )

  // Raw (pre-cut) fee sum per trainer, for the summary's "Raw Fees" column —
  // mirrors getFinancialSummary's cutByTier direct-sum pattern above.
  const grossByTrainer = new Map<string, number>()
  for (const l of lessons) {
    const k = l.instructor_id ?? NO_INSTRUCTOR_LABEL
    grossByTrainer.set(k, (grossByTrainer.get(k) ?? 0) + l.fee)
  }

  const instructorIds = [...grouped.keys()].filter((id) => id !== NO_INSTRUCTOR_LABEL)
  const memberNameMap = await resolveMemberNames(instructorIds, barnId, supabase)

  const result: TrainerIncomeSummary[] = toSortedIncomeRows(grouped, NO_INSTRUCTOR_LABEL, memberNameMap).map((r) => ({
    trainerId: r.id,
    trainerName: r.name,
    totalIncome: r.totalIncome,
    grossIncome: grossByTrainer.get(r.id) ?? null,
  }))

  const chargesFold = foldChargesCollected(charges)
  if (chargesFold.total > 0) {
    result.push({ trainerId: NON_LESSON_INCOME_LABEL, trainerName: NON_LESSON_INCOME_LABEL, totalIncome: chargesFold.total, grossIncome: null })
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
    getPaidLessonRows(barnId, startDate, endDate, ['id', 'lesson_at'], supabase) as Promise<
      { id: string; fee: number; lesson_at: string; instructor_cut: number }[]
    >,
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])

  const horseNameMap = await resolveHorseNames([horseId], barnId, supabase)
  const horseName = horseNameMap.get(horseId) ?? horseId

  let rows: HorseIncomeDetailRow[] = []
  if (lessonsData.length) {
    const lessonIds = lessonsData.map((l) => l.id)
    const lessonHorses = await getLessonJunctionRows('lesson_horses', 'horse_id', barnId, lessonIds, supabase)
    rows = computeDetailRows(
      lessonsData,
      (lessonId) => lessonHorses.filter((lh) => lh.lesson_id === lessonId),
      (lh) => lh.horse_id,
      horseId
    ).map((d) => ({ lessonId: d.lessonId, lessonAt: d.lessonAt, fee: d.fee, horseCount: d.count, splitAmount: d.splitAmount }))
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
    getPaidLessonRows(barnId, startDate, endDate, ['id', 'lesson_at'], supabase) as Promise<
      { id: string; fee: number; lesson_at: string; instructor_cut: number }[]
    >,
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])

  const memberNameMap = await resolveMemberNames([riderId], barnId, supabase)
  const riderName = memberNameMap.get(riderId) ?? riderId

  let rows: RiderIncomeDetailRow[] = []
  if (lessonsData.length) {
    const lessonIds = lessonsData.map((l) => l.id)
    const lessonRiders = await getLessonJunctionRows('lesson_riders', 'rider_id', barnId, lessonIds, supabase)
    rows = computeDetailRows(
      lessonsData,
      (lessonId) => lessonRiders.filter((lr) => lr.lesson_id === lessonId),
      (lr) => lr.rider_id,
      riderId
    ).map((d) => ({ lessonId: d.lessonId, lessonAt: d.lessonAt, fee: d.fee, riderCount: d.count, splitAmount: d.splitAmount }))
  }

  const chargeRows: RiderChargeDetailRow[] = charges
    .filter((c) => c.riderId === riderId)
    .map((c) => ({ chargeId: c.chargeId, agreementId: c.agreementId, period: c.period, kind: c.kind, fee: c.fee }))

  const total = rows.reduce((sum, r) => sum + r.splitAmount, 0) + chargeRows.reduce((sum, r) => sum + r.fee, 0)
  return { riderName, rows, chargeRows, total }
}

export async function getTrainerIncomeDetail(
  barnId: string,
  trainerId: string,
  startDate: Date,
  endDate: Date
): Promise<{ trainerName: string; rows: TrainerIncomeDetailRow[]; total: number }> {
  const supabase = await createClient()

  const lessonsData = await getPaidLessonRows(barnId, startDate, endDate, ['id', 'lesson_at', 'instructor_id'], supabase) as
    { id: string; fee: number; lesson_at: string; instructor_cut: number; instructor_id: string | null }[]

  const memberNameMap = await resolveMemberNames([trainerId], barnId, supabase)
  const trainerName = memberNameMap.get(trainerId) ?? trainerId

  // No junction table for instructor (single lessons.instructor_id column, not a
  // many-to-many like lesson_riders/lesson_horses), so each matching lesson's
  // full net fee goes to this trainer — no split.
  const rows: TrainerIncomeDetailRow[] = lessonsData
    .filter((l) => l.instructor_id === trainerId)
    .map((l) => ({ lessonId: l.id, lessonAt: l.lesson_at, fee: l.fee - l.instructor_cut }))

  const total = rows.reduce((sum, r) => sum + r.fee, 0)
  return { trainerName, rows, total }
}
