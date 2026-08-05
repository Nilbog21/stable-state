/**
 * Lesson income reporting: pure fold helpers (`splitNetFee`, `computeGroupedIncome`,
 * `computeHorseNetIncome`), the barn-wide `getFinancialSummary`, and per-entity income
 * summaries/details dispatched through `getEntityIncome` over the horse/rider/trainer
 * `EntityIncomeDescriptor`s. Lesson-derived rows come from
 * `lesson-finance-queries.ts:getLessonFeeRows` (the `transactions` ledger, #827).
 *
 * Whether the instructor cut is netted off is per-view, not module-wide. Each lesson's
 * own snapshotted cut (#776) is subtracted for the tier breakdown and the whole trainer
 * view, where that cut is the subject. The horse and rider views report the gross
 * (pre-cut) split instead — their descriptors set `splitsGrossFee`, since a per-entity
 * share of a cut By Instructor already accounts for in full is money attributed twice
 * (#971 for the summaries, #1156 for the drill-downs, which had been left disagreeing
 * with the very tabs they hang off). Outstanding lives in `outstanding.ts`, which never
 * applies the cut at all.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './member-names'
import { resolveHorseNames } from './horses'
import {
  getLessonFeeRows,
  getTierPricesByNames,
  getLessonJunctionRows,
  type LessonFeeRow,
} from './lesson-finance-queries'
import { getChargesForSummary, getPaidCharges } from './agreement-finances'
import type { PaidCharge } from './agreement-finances'
import { getTiersByBarn } from './lesson-tiers'
import { firstOfMonth } from '../local-day'
import { barnToday } from '../barn-timezone'
import type {
  CalendarDate,
  FinancialSummary,
  HorseChargeDetailRow,
  HorseExpenseSummary,
  HorseIncomeDetailRow,
  HorseIncomeSummary,
  HorseNetIncomeRow,
  RiderChargeDetailRow,
  RiderIncomeDetailRow,
  RiderIncomeSummary,
  TrainerIncomeDetailRow,
  TrainerIncomeSummary,
} from './types'
import type { ChargeSummaryRow } from './agreement-finances'

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

/**
 * Shared per-lesson-row body for getEntityIncomeDetail's horse/rider/trainer paths —
 * per-lesson rows for a single target participant. Like computeGroupedIncome, it always
 * runs splitNetFee; a `splitsGrossFee` descriptor gets its gross split by having the
 * caller zero each row's cut first, rather than by a second code path in here.
 */
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

// #971: horseIncome's totalIncome is gross (pre-cut, via HORSE_INCOME_DESCRIPTOR's
// splitsGrossFee), so net here is a single gross-minus-expenses subtraction — expenses
// (a horse's own vet/farrier costs) are shown for transparency but instructor cut is not
// double-subtracted the way it used to be.
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
        gross: income?.totalIncome ?? 0,
        expenses: expenses?.totalExpenses ?? 0,
        net: (income?.totalIncome ?? 0) - (expenses?.totalExpenses ?? 0),
      }
    })
    .sort((a, b) => b.gross - a.gross || a.horseName.localeCompare(b.horseName))
}

export async function getFinancialSummary(
  barnId: string,
  startDate: Date,
  endDate: Date,
  timezone: string
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

  // #1309: the barn's own month, not the server host's — `ChargeSummaryRow.period` is a
  // zoneless calendar date naming a billing month, so it is this comparison that has to
  // supply a zone, and "is that month current or later?" is a question about the barn's day.
  // Every zone in BARN_TIMEZONES is behind UTC, so answering it on the host's clock rolled
  // the boundary over 4-10 hours early and flipped Pending income onto the next month's
  // basis. (The `occurredAt > now` lesson rule above is untouched: that compares two real
  // instants, which is zone-free.)
  const firstOfCurrentMonth = firstOfMonth(barnToday(timezone))

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

/**
 * Descriptor capturing how a single entity (horse/rider/trainer) plugs into the
 * shared getEntityIncome pipeline below — junction-table presence, how agreement
 * charges fold in, and name resolution, as data instead of three parallel
 * copy-pasted functions per mode. `junctionTable: null` means the entity is keyed
 * directly off `LessonFeeRow.instructorId` (trainer — no lesson_trainers table,
 * since `lessons.instructor_id` is a single column, not a many-to-many).
 */
export interface EntityIncomeDescriptor {
  junctionTable: 'lesson_horses' | 'lesson_riders' | null
  participantColumn: 'horse_id' | 'rider_id' | null
  fallbackLabel: string
  /** true: fold getPaidCharges in per-entity, unsplit (horse/rider). false: getChargesForSummary
   *  folds into one synthetic NON_LESSON_INCOME_LABEL row instead (trainer — agreements have no instructor). */
  chargesApply: boolean
  getChargeEntityId?: (charge: PaidCharge) => string | null
  resolveNames: (ids: string[], barnId: string, client: SupabaseClient) => Promise<Map<string, string>>
  /** trainer only — raw pre-cut fee sum per entity, for the summary's grossIncome column. */
  includeGrossIncome?: boolean
  /**
   * #971: horse/rider only — summary mode's own totalIncome becomes the gross (pre-cut) split
   * instead of net-of-cut, since By Horse/By Rider no longer track a per-entity share of
   * instructor cut (it's "outside this view" for those tables — see finances-reconciliation.ts).
   * #1156 extended the flag to detail mode, so a drill-down reconciles with the tab it was
   * reached from; #971 had scoped detail out, and that gap was the whole of the discrepancy.
   */
  splitsGrossFee?: boolean
}

export const HORSE_INCOME_DESCRIPTOR: EntityIncomeDescriptor = {
  junctionTable: 'lesson_horses',
  participantColumn: 'horse_id',
  fallbackLabel: NO_HORSE_LABEL,
  chargesApply: true,
  getChargeEntityId: (c) => c.horseId,
  resolveNames: resolveHorseNames,
  splitsGrossFee: true,
}

export const RIDER_INCOME_DESCRIPTOR: EntityIncomeDescriptor = {
  junctionTable: 'lesson_riders',
  participantColumn: 'rider_id',
  fallbackLabel: NO_RIDER_LABEL,
  chargesApply: true,
  getChargeEntityId: (c) => c.riderId,
  resolveNames: resolveMemberNames,
  splitsGrossFee: true,
}

export const TRAINER_INCOME_DESCRIPTOR: EntityIncomeDescriptor = {
  junctionTable: null,
  participantColumn: null,
  fallbackLabel: NO_INSTRUCTOR_LABEL,
  chargesApply: false,
  resolveNames: resolveMemberNames,
  includeGrossIncome: true,
}

interface EntityIncomeRow {
  id: string
  name: string
  totalIncome: number
  grossIncome: number | null
}

interface EntityIncomeDetailRow {
  lessonId: string
  lessonAt: string
  fee: number
  count: number
  splitAmount: number
}

interface EntityIncomeChargeRow {
  chargeId: string
  agreementId: string
  period: CalendarDate
  kind: PaidCharge['kind']
  fee: number
}

interface EntityIncomeDetail {
  name: string
  rows: EntityIncomeDetailRow[]
  chargeRows: EntityIncomeChargeRow[]
  total: number
}

/** Junction rows for descriptor.junctionTable, or [] for a non-junction (trainer) descriptor —
 * only fetched when there's at least one lessonId, so an all-empty lesson set never queries. */
async function fetchJunctionRows(
  descriptor: EntityIncomeDescriptor,
  barnId: string,
  lessonIds: string[],
  client: SupabaseClient
) {
  if (!descriptor.junctionTable || !lessonIds.length) return []
  return getLessonJunctionRows(descriptor.junctionTable, descriptor.participantColumn!, barnId, lessonIds, client)
}

function participantKey(descriptor: EntityIncomeDescriptor, junctionRows: { lesson_id: string; [k: string]: string }[]) {
  return (l: LessonFeeRow): string[] => {
    if (descriptor.junctionTable) {
      return junctionRows.filter((j) => j.lesson_id === l.lessonId).map((j) => j[descriptor.participantColumn!])
    }
    return l.instructorId ? [l.instructorId] : []
  }
}

async function getEntityIncomeSummary(
  descriptor: EntityIncomeDescriptor,
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<EntityIncomeRow[]> {
  const supabase = await createClient()

  const rows = await getLessonFeeRows(barnId, startDate, endDate, supabase)
  const lessons = rows.filter((r) => r.collected)
  const lessonIds = lessons.map((l) => l.lessonId).filter((id): id is string => id !== null)

  const junctionRows = await fetchJunctionRows(descriptor, barnId, lessonIds, supabase)
  const getKey = participantKey(descriptor, junctionRows)
  // #971: splitsGrossFee zeroes each row's cut before computeGroupedIncome nets it, so
  // totalIncome ends up as the gross (pre-cut) split — reusing the existing proportional
  // split logic rather than duplicating it via a second grouped pass.
  const groupedRows = descriptor.splitsGrossFee ? lessons.map((l) => ({ ...l, instructorCut: 0 })) : lessons
  const grouped = computeGroupedIncome(groupedRows, getKey, descriptor.fallbackLabel)

  let grossByEntity: Map<string, number> | undefined
  if (descriptor.includeGrossIncome) {
    grossByEntity = new Map()
    for (const l of lessons) {
      const k = getKey(l)[0] ?? descriptor.fallbackLabel
      grossByEntity.set(k, (grossByEntity.get(k) ?? 0) + l.fee)
    }
  }

  let nonLessonRow: { total: number; count: number } | null = null
  if (descriptor.chargesApply) {
    const charges = await getPaidCharges(barnId, startDate, endDate, supabase)
    for (const charge of charges) {
      // getChargeEntityId can return null (e.g. a charge's rider/horse relation was
      // cleared by ON DELETE SET NULL) — folds into the same fallback bucket a lesson
      // with no junction rows already falls into, instead of a literal `null` key.
      const id = descriptor.getChargeEntityId!(charge) ?? descriptor.fallbackLabel
      const existing = grouped.get(id) ?? { total: 0, count: 0 }
      grouped.set(id, { total: existing.total + charge.fee, count: existing.count + 1 })
    }
    if (!grouped.size) return []
  } else {
    const charges = await getChargesForSummary(barnId, startDate, endDate, supabase)
    const fold = foldChargesCollected(charges)
    if (fold.total > 0) nonLessonRow = fold
  }

  const ids = [...grouped.keys()].filter((id) => id !== descriptor.fallbackLabel)
  const nameMap = await descriptor.resolveNames(ids, barnId, supabase)

  const result: EntityIncomeRow[] = toSortedIncomeRows(grouped, descriptor.fallbackLabel, nameMap).map((r) => ({
    ...r,
    // grossByEntity, when present, is built from the same lessons array with the same
    // key-or-fallback routing as `grouped`, so every sorted row's id has an entry.
    grossIncome: grossByEntity ? grossByEntity.get(r.id)! : null,
  }))

  if (nonLessonRow) {
    result.push({ id: NON_LESSON_INCOME_LABEL, name: NON_LESSON_INCOME_LABEL, totalIncome: nonLessonRow.total, grossIncome: null })
  }

  return result
}

async function getEntityIncomeDetail(
  descriptor: EntityIncomeDescriptor,
  barnId: string,
  targetId: string,
  startDate: Date,
  endDate: Date
): Promise<EntityIncomeDetail> {
  const supabase = await createClient()

  const rows = await getLessonFeeRows(barnId, startDate, endDate, supabase)
  const lessonsData = rows.filter((r) => r.collected).filter(hasLesson)

  const nameMap = await descriptor.resolveNames([targetId], barnId, supabase)
  const name = nameMap.get(targetId) ?? targetId

  // #1156: the same zero-the-cut-then-split move getEntityIncomeSummary makes, so a
  // drill-down row is the pre-cut split its own tab's row is built from. Apportioning a
  // slice of the instructor's cut to a horse or a rider splits money that By Instructor
  // already accounts for in full, and was the sole reason the two pages disagreed.
  // Trainer detail keeps the cut — there it's the subject of the view, not a stray share.
  const detailLessons = descriptor.splitsGrossFee ? lessonsData.map((l) => ({ ...l, instructorCut: 0 })) : lessonsData

  let detailRows: EntityIncomeDetailRow[] = []
  if (lessonsData.length) {
    const lessonIds = lessonsData.map((l) => l.lessonId)
    if (descriptor.junctionTable) {
      const junctionRows = await getLessonJunctionRows(descriptor.junctionTable, descriptor.participantColumn!, barnId, lessonIds, supabase)
      detailRows = computeDetailRows(
        detailLessons,
        (lessonId) => junctionRows.filter((j) => j.lesson_id === lessonId),
        (j) => j[descriptor.participantColumn!],
        targetId
      )
    } else {
      const instructorByLessonId = new Map(lessonsData.map((l) => [l.lessonId, l.instructorId]))
      detailRows = computeDetailRows(
        detailLessons,
        (lessonId) => {
          const instructorId = instructorByLessonId.get(lessonId)
          return instructorId ? [instructorId] : []
        },
        (id) => id,
        targetId
      )
    }
  }

  let chargeRows: EntityIncomeChargeRow[] = []
  if (descriptor.chargesApply) {
    const charges = await getPaidCharges(barnId, startDate, endDate, supabase)
    chargeRows = charges
      .filter((c) => descriptor.getChargeEntityId!(c) === targetId)
      .map((c) => ({ chargeId: c.chargeId, agreementId: c.agreementId, period: c.period, kind: c.kind, fee: c.fee }))
  }

  const total = detailRows.reduce((sum, r) => sum + r.splitAmount, 0) + chargeRows.reduce((sum, r) => sum + r.fee, 0)
  return { name, rows: detailRows, chargeRows, total }
}

export async function getEntityIncome(
  descriptor: EntityIncomeDescriptor,
  mode: 'summary',
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<EntityIncomeRow[]>
export async function getEntityIncome(
  descriptor: EntityIncomeDescriptor,
  mode: 'detail',
  barnId: string,
  startDate: Date,
  endDate: Date,
  targetId: string
): Promise<EntityIncomeDetail>
export async function getEntityIncome(
  descriptor: EntityIncomeDescriptor,
  mode: 'summary' | 'detail',
  barnId: string,
  startDate: Date,
  endDate: Date,
  targetId?: string
): Promise<EntityIncomeRow[] | EntityIncomeDetail> {
  return mode === 'summary'
    ? getEntityIncomeSummary(descriptor, barnId, startDate, endDate)
    : getEntityIncomeDetail(descriptor, barnId, targetId!, startDate, endDate)
}

export async function getHorseIncomeSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<HorseIncomeSummary[]> {
  const rows = await getEntityIncome(HORSE_INCOME_DESCRIPTOR, 'summary', barnId, startDate, endDate)
  return rows.map((r) => ({ horseId: r.id, horseName: r.name, totalIncome: r.totalIncome }))
}

export async function getRiderIncomeSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<RiderIncomeSummary[]> {
  const rows = await getEntityIncome(RIDER_INCOME_DESCRIPTOR, 'summary', barnId, startDate, endDate)
  return rows.map((r) => ({ riderId: r.id, riderName: r.name, totalIncome: r.totalIncome }))
}

export async function getTrainerIncomeSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<TrainerIncomeSummary[]> {
  const rows = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'summary', barnId, startDate, endDate)
  return rows.map((r) => ({ trainerId: r.id, trainerName: r.name, totalIncome: r.totalIncome, grossIncome: r.grossIncome }))
}

export async function getHorseIncomeDetail(
  barnId: string,
  horseId: string,
  startDate: Date,
  endDate: Date,
  timezone: string
): Promise<{ horseName: string; rows: HorseIncomeDetailRow[]; chargeRows: HorseChargeDetailRow[]; total: number }> {
  const { name, rows, chargeRows, total } = await getEntityIncome(HORSE_INCOME_DESCRIPTOR, 'detail', barnId, startDate, endDate, horseId)
  return {
    horseName: name,
    rows: rows.map((r) => ({ lessonId: r.lessonId, lessonAt: { at: r.lessonAt, tz: timezone }, fee: r.fee, horseCount: r.count, splitAmount: r.splitAmount })),
    chargeRows,
    total,
  }
}

export async function getRiderIncomeDetail(
  barnId: string,
  riderId: string,
  startDate: Date,
  endDate: Date,
  timezone: string
): Promise<{ riderName: string; rows: RiderIncomeDetailRow[]; chargeRows: RiderChargeDetailRow[]; total: number }> {
  const { name, rows, chargeRows, total } = await getEntityIncome(RIDER_INCOME_DESCRIPTOR, 'detail', barnId, startDate, endDate, riderId)
  return {
    riderName: name,
    rows: rows.map((r) => ({ lessonId: r.lessonId, lessonAt: { at: r.lessonAt, tz: timezone }, fee: r.fee, riderCount: r.count, splitAmount: r.splitAmount })),
    chargeRows,
    total,
  }
}

export async function getTrainerIncomeDetail(
  barnId: string,
  trainerId: string,
  startDate: Date,
  endDate: Date,
  timezone: string
): Promise<{ trainerName: string; rows: TrainerIncomeDetailRow[]; total: number }> {
  const { name, rows, total } = await getEntityIncome(TRAINER_INCOME_DESCRIPTOR, 'detail', barnId, startDate, endDate, trainerId)
  return {
    trainerName: name,
    rows: rows.map((r) => ({ lessonId: r.lessonId, lessonAt: { at: r.lessonAt, tz: timezone }, fee: r.fee })),
    total,
  }
}
