import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './member-names'
import { resolveHorseNames } from './horses'
import {
  getLessonFeeRows,
  getTierPricesByNames,
  getOutstandingLessonRows,
  getLessonJunctionRows,
  type LessonFeeRow,
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
 * Shared fold+cut+fallback pipeline: nets each row's own snapshotted instructorCut
 * once, splits the remainder across `key(row)`'s participant keys, and accumulates
 * rows with no keys under `fallbackLabel` instead of splitting. Single source of
 * cut-subtraction (via splitNetFee) and of "no participant" fallback accumulation
 * for all summary adapters below. The cut is read from each row rather than taken
 * as a shared parameter, since it's snapshotted per lesson at creation time.
 */
export function computeGroupedIncome<T extends { fee: number; instructorCut: number }>(
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
    const { netFee, splitAmount } = splitNetFee(row.fee, row.instructorCut, keys.length || 1)
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

/**
 * A collected row whose lesson was deleted (see getLessonFeeRows) has no junction
 * rows left to attribute to a specific horse/rider/trainer drill-down — its income
 * still counts in the summary totals above (via NO_HORSE_LABEL/NO_RIDER_LABEL/
 * NO_INSTRUCTOR_LABEL) but is excluded from these per-entity detail pages, since
 * there's no lesson left to link the row to.
 */
function hasLesson(row: LessonFeeRow): row is LessonFeeRow & { lessonId: string } {
  return row.lessonId !== null
}

/** Shared body for getHorseIncomeDetail/getRiderIncomeDetail — per-lesson rows for a single target participant. */
function computeDetailRows<P>(
  lessons: { lessonId: string; fee: number; occurredAt: string; instructorCut: number }[],
  participantsByLessonId: (lessonId: string) => P[],
  getParticipantKey: (p: P) => string,
  targetId: string
): { lessonId: string; lessonAt: string; fee: number; count: number; splitAmount: number }[] {
  const rows: { lessonId: string; lessonAt: string; fee: number; count: number; splitAmount: number }[] = []

  for (const lesson of lessons) {
    const participants = participantsByLessonId(lesson.lessonId)
    if (!participants.some((p) => getParticipantKey(p) === targetId)) continue
    const count = participants.length
    const { netFee, splitAmount } = splitNetFee(lesson.fee, lesson.instructorCut, count)
    rows.push({ lessonId: lesson.lessonId, lessonAt: lesson.occurredAt, fee: netFee, count, splitAmount })
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

  const [rows, charges, activeTiers] = await Promise.all([
    getLessonFeeRows(barnId, startDate, endDate, supabase),
    getChargesForSummary(barnId, startDate, endDate, supabase),
    getTiersByBarn(barnId),
  ])

  const paidLessons = rows.filter((r) => r.collected)
  const tierGroups = computeGroupedIncome(paidLessons, (r) => [r.tierName || 'Custom'], 'Custom')

  let collectedIncome = 0
  for (const { total } of tierGroups.values()) collectedIncome += total

  let pendingIncome = rows
    .filter((r) => !r.collected && new Date(r.occurredAt) > now)
    .reduce((sum, r) => sum + splitNetFee(r.fee, r.instructorCut, 1).netFee, 0)

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

  // Sum of each tier group's own paid lessons' snapshotted instructorCut — tier
  // grouping is always exactly one key per lesson, so this is a direct sum with
  // no split/double-count risk, unlike the by-horse/rider groupings above.
  const cutByTier = new Map<string, number>()
  for (const r of paidLessons) {
    const t = r.tierName || 'Custom'
    cutByTier.set(t, (cutByTier.get(t) ?? 0) + r.instructorCut)
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
      // tierName || 'Custom' key, so every tierGroups key has a cutByTier entry.
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

  const [rows, charges] = await Promise.all([
    getLessonFeeRows(barnId, startDate, endDate, supabase),
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])
  const lessons = rows.filter((r) => r.collected)

  let grouped = new Map<string, { total: number; count: number }>()
  if (lessons.length) {
    // A deleted lesson's kept-around transaction has lessonId=null and no junction
    // rows to find (lesson_horses cascades on delete) — excluded from the query,
    // it naturally falls into NO_HORSE_LABEL below via `key`'s empty-array return.
    const lessonIds = lessons.map((l) => l.lessonId).filter((id): id is string => id !== null)
    const lessonHorses = await getLessonJunctionRows('lesson_horses', 'horse_id', barnId, lessonIds, supabase)
    grouped = computeGroupedIncome(
      lessons,
      (l) => lessonHorses.filter((lh) => lh.lesson_id === l.lessonId).map((lh) => lh.horse_id),
      NO_HORSE_LABEL
    )
  }

  for (const charge of charges) {
    // horseId is null when the charge's horse relation was cleared (ON DELETE SET NULL)
    const horseId = charge.horseId ?? NO_HORSE_LABEL
    const existing = grouped.get(horseId) ?? { total: 0, count: 0 }
    grouped.set(horseId, { total: existing.total + charge.fee, count: existing.count + 1 })
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

  const [rows, charges] = await Promise.all([
    getLessonFeeRows(barnId, startDate, endDate, supabase),
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])
  const lessons = rows.filter((r) => r.collected)

  let grouped = new Map<string, { total: number; count: number }>()
  if (lessons.length) {
    // See getHorseIncomeSummary above — a deleted lesson's orphaned transaction has
    // no junction rows to find and falls into NO_RIDER_LABEL via `key`'s empty array.
    const lessonIds = lessons.map((l) => l.lessonId).filter((id): id is string => id !== null)
    const lessonRiders = await getLessonJunctionRows('lesson_riders', 'rider_id', barnId, lessonIds, supabase)
    grouped = computeGroupedIncome(
      lessons,
      (l) => lessonRiders.filter((lr) => lr.lesson_id === l.lessonId).map((lr) => lr.rider_id),
      NO_RIDER_LABEL
    )
  }

  for (const charge of charges) {
    // riderId is null when the charge's rider membership was removed (ON DELETE SET NULL)
    const riderId = charge.riderId ?? NO_RIDER_LABEL
    const existing = grouped.get(riderId) ?? { total: 0, count: 0 }
    grouped.set(riderId, { total: existing.total + charge.fee, count: existing.count + 1 })
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

  const [rows, charges] = await Promise.all([
    getLessonFeeRows(barnId, startDate, endDate, supabase),
    getChargesForSummary(barnId, startDate, endDate, supabase),
  ])
  const lessons = rows.filter((r) => r.collected)

  const grouped = computeGroupedIncome(
    lessons,
    (l) => (l.instructorId ? [l.instructorId] : []),
    NO_INSTRUCTOR_LABEL
  )

  // Raw (pre-cut) fee sum per trainer, for the summary's "Raw Fees" column —
  // mirrors getFinancialSummary's cutByTier direct-sum pattern above.
  const grossByTrainer = new Map<string, number>()
  for (const l of lessons) {
    const k = l.instructorId ? l.instructorId : NO_INSTRUCTOR_LABEL
    grossByTrainer.set(k, (grossByTrainer.get(k) ?? 0) + l.fee)
  }

  const instructorIds = [...grouped.keys()].filter((id) => id !== NO_INSTRUCTOR_LABEL)
  const memberNameMap = await resolveMemberNames(instructorIds, barnId, supabase)

  const result: TrainerIncomeSummary[] = toSortedIncomeRows(grouped, NO_INSTRUCTOR_LABEL, memberNameMap).map((r) => ({
    trainerId: r.id,
    trainerName: r.name,
    totalIncome: r.totalIncome,
    // grouped and grossByTrainer are both built from the same lessons array with the
    // same instructorId-or-fallback key, so every grouped key has a grossByTrainer entry.
    grossIncome: grossByTrainer.get(r.id)!,
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

  const [rows, charges] = await Promise.all([
    getLessonFeeRows(barnId, startDate, endDate, supabase),
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])
  const lessonsData = rows.filter((r) => r.collected).filter(hasLesson)

  const horseNameMap = await resolveHorseNames([horseId], barnId, supabase)
  const horseName = horseNameMap.get(horseId) ?? horseId

  let detailRows: HorseIncomeDetailRow[] = []
  if (lessonsData.length) {
    const lessonIds = lessonsData.map((l) => l.lessonId)
    const lessonHorses = await getLessonJunctionRows('lesson_horses', 'horse_id', barnId, lessonIds, supabase)
    detailRows = computeDetailRows(
      lessonsData,
      (lessonId) => lessonHorses.filter((lh) => lh.lesson_id === lessonId),
      (lh) => lh.horse_id,
      horseId
    ).map((d) => ({ lessonId: d.lessonId, lessonAt: d.lessonAt, fee: d.fee, horseCount: d.count, splitAmount: d.splitAmount }))
  }

  const chargeRows: HorseChargeDetailRow[] = charges
    .filter((c) => c.horseId === horseId)
    .map((c) => ({ chargeId: c.chargeId, agreementId: c.agreementId, period: c.period, kind: c.kind, fee: c.fee }))

  const total = detailRows.reduce((sum, r) => sum + r.splitAmount, 0) + chargeRows.reduce((sum, r) => sum + r.fee, 0)
  return { horseName, rows: detailRows, chargeRows, total }
}

export async function getRiderIncomeDetail(
  barnId: string,
  riderId: string,
  startDate: Date,
  endDate: Date
): Promise<{ riderName: string; rows: RiderIncomeDetailRow[]; chargeRows: RiderChargeDetailRow[]; total: number }> {
  const supabase = await createClient()

  const [rows, charges] = await Promise.all([
    getLessonFeeRows(barnId, startDate, endDate, supabase),
    getPaidCharges(barnId, startDate, endDate, supabase),
  ])
  const lessonsData = rows.filter((r) => r.collected).filter(hasLesson)

  const memberNameMap = await resolveMemberNames([riderId], barnId, supabase)
  const riderName = memberNameMap.get(riderId) ?? riderId

  let detailRows: RiderIncomeDetailRow[] = []
  if (lessonsData.length) {
    const lessonIds = lessonsData.map((l) => l.lessonId)
    const lessonRiders = await getLessonJunctionRows('lesson_riders', 'rider_id', barnId, lessonIds, supabase)
    detailRows = computeDetailRows(
      lessonsData,
      (lessonId) => lessonRiders.filter((lr) => lr.lesson_id === lessonId),
      (lr) => lr.rider_id,
      riderId
    ).map((d) => ({ lessonId: d.lessonId, lessonAt: d.lessonAt, fee: d.fee, riderCount: d.count, splitAmount: d.splitAmount }))
  }

  const chargeRows: RiderChargeDetailRow[] = charges
    .filter((c) => c.riderId === riderId)
    .map((c) => ({ chargeId: c.chargeId, agreementId: c.agreementId, period: c.period, kind: c.kind, fee: c.fee }))

  const total = detailRows.reduce((sum, r) => sum + r.splitAmount, 0) + chargeRows.reduce((sum, r) => sum + r.fee, 0)
  return { riderName, rows: detailRows, chargeRows, total }
}

export async function getTrainerIncomeDetail(
  barnId: string,
  trainerId: string,
  startDate: Date,
  endDate: Date
): Promise<{ trainerName: string; rows: TrainerIncomeDetailRow[]; total: number }> {
  const supabase = await createClient()

  const rows = await getLessonFeeRows(barnId, startDate, endDate, supabase)
  const lessonsData = rows.filter((r) => r.collected).filter(hasLesson)

  const memberNameMap = await resolveMemberNames([trainerId], barnId, supabase)
  const trainerName = memberNameMap.get(trainerId) ?? trainerId

  // No junction table for instructor (single lessons.instructor_id column, not a
  // many-to-many like lesson_riders/lesson_horses), so each matching lesson's
  // full net fee goes to this trainer — no split.
  const detailRows: TrainerIncomeDetailRow[] = lessonsData
    .filter((l) => l.instructorId === trainerId)
    .map((l) => ({ lessonId: l.lessonId, lessonAt: l.occurredAt, fee: l.fee - l.instructorCut }))

  const total = detailRows.reduce((sum, r) => sum + r.fee, 0)
  return { trainerName, rows: detailRows, total }
}
