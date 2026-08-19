/**
 * Shared barn-seeding module (#502): `seedBarn(supabase, barnId, barnSlug,
 * managerUserId, now?, emailDomain?)` seeds a complete fixture barn — the manager2 membership with
 * contact info, two pricing tiers, the trainer/rider rosters, the horse set (including
 * the retired and unavailable ones), horse and profile photos from `scripts/data/`,
 * lessons spanning the prior three months through the coming week with alternating
 * tiers/jumping/exertion/payment types, board and lease agreements with paid, unpaid,
 * and past-due charges, and planned/collected expense seeds — returning
 * `SeedBarnResult` for the caller's own summary output. Both callers inject a
 * service-role client: `reset-db.ts` (the fixed `dev-barn`) and `/demo`'s
 * `createOrResumeDemoBarn` (`src/app/demo/actions.ts`). The exported `DEV_*` fixture
 * constants and pure helpers (`buildLessonDates`, `getLessonVariation`,
 * `getPaymentType`, `buildExpenseSeeds`, `computeExhaustionWindowTotals`, …) are the
 * module's test surface (`seed-barn.test.ts`), re-imported by `reset-db.ts` for its
 * summary math.
 */
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { upsertProfile, updateContactInfo, replaceProfilePhoto } from '@/lib/db/profiles'
import { createTier } from '@/lib/db/lesson-tiers'

import { createHorse, replaceHorsePhoto } from '@/lib/db/horses'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { createLessonSeries } from '@/lib/db/lesson-series'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { createAgreement, generateChargeForMonth, getBarnDefaultBoardFee } from '@/lib/db/agreements'
import { createExpense } from '@/lib/db/expenses'
import type { PaymentType } from '@/lib/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { barnDay } from '@/lib/barn-timezone'
import { mustSucceed, findOrCreateAuthUser } from './script-utils'

// #1579: `profiles_email_unique` is a partial unique index on `email` across the whole table,
// not per barn, so two fixture barns on one DB compete for a single roster. `seedBarn`'s
// `emailDomain` parameter is what separates them — the `DEV_*` constants below keep their
// `@dev.local` literals (they are the module's exported test surface, and `reset-db.ts` reads
// them for its summary) and every seeding call site runs them through this instead.
export function withEmailDomain(email: string, domain: string): string {
  return `${email.split('@')[0]}@${domain}`
}

export const DEV_TRAINERS = [
  { email: 'trainer1@dev.local', firstName: 'Alex',  lastName: 'Trainer' },
  { email: 'trainer2@dev.local', firstName: 'Blake', lastName: 'Trainer' },
  { email: 'trainer3@dev.local', firstName: 'Casey', lastName: 'Trainer' },
]

export const DEV_RIDERS = [
  { email: 'rider1@dev.local', firstName: 'Dana',   lastName: 'Rider' },
  { email: 'rider2@dev.local', firstName: 'Emery',  lastName: 'Rider' },
  { email: 'rider3@dev.local', firstName: 'Finley', lastName: 'Rider' },
]

export const DEV_HORSES = ['Apple', 'Butter', 'Clover']
export const DEV_RETIRED_HORSE = 'Willow'
export const DEV_UNAVAILABLE_HORSE = 'Hazel'
export const DEV_UNAVAILABLE_REASON = 'Recovering from minor injury'

// #1413: the two dark-mode lines in `checklists/pre-release/phase-3-manager-lesson-entry.md`'s
// (#1019) block stay `(manual)` — they compare an amber day against a red one by eye — while
// every line around them becomes an `(e2e:)` a human never performs. So the amber day and the
// red day have to exist in the seed rather than fall out of the checkboxes above them.
//
// Its own horse rather than a cluster bolted onto Apple/Butter/Clover: those three carry the
// low/moderate/high *total-exertion* spread the horses-list checks read, and adding future
// lessons to any of them moves that spread. Here nothing else contributes, so the two days are
// exactly the two lessons below.
export const DEV_CALENDAR_BAND_HORSE = 'Juniper'

// Below the barn defaults (5 / 11), which is what lets four lessons do the job of the eleven it
// would otherwise take — exertion_level is capped at 5. Both bands render from the same
// `BAND_TINT_CLASS` regardless of how the total got there, so a low pair is not a weaker fixture
// for a colour comparison, just a cheaper one. The gap between them is the headroom that keeps
// the moderate day moderate when a neighbouring cluster leaks into its window (see below).
export const DEV_CALENDAR_BAND_THRESHOLDS = { moderate: 3, high: 8 }

// Day +1 and day +5, and the 4-day gap is load-bearing rather than aesthetic:
// `computeDayDecorations` centres its ±3-day window on the form's *Start Time*, not on midnight,
// so two lessons 4 days apart fall inside one window at some hours and not others. At 5 days
// apart the nearest approach is 3d13h — outside it at every hour, which is what keeps day +1
// moderate instead of flipping high. Day +5 is also the furthest day guaranteed to be on the
// grid at all: a 31-day month starting Saturday grids only to day 36, so from its last day
// there are exactly 5 days of grid left.
export const DEV_CALENDAR_BAND_MODERATE_DAY_OFFSET = 1
export const DEV_CALENDAR_BAND_HIGH_DAY_OFFSET = 5

// The third cluster serves the *other* dark-mode line — the date number on a **tinted
// neighbouring-month** day. Anchored to the next month's 3rd rather than to an offset from
// today, because the two above are neighbouring-month days only when today happens to fall in
// the last few days of a month. Days 1–5 of the next month are always carried into the current
// grid (42 cells from the Sunday on or before the 1st leaves at least 5), so the 3rd always
// lands there, always dimmed, always in the future.
export const DEV_CALENDAR_BAND_NEXT_MONTH_DAY = 3

/**
 * The four lessons behind #1413's two `(manual)` dark-mode checks. Exported so
 * `seed-barn.test.ts` can put them through the real `computeDayDecorations` and prove the
 * guarantee holds from every "today" and every Start Time, rather than restating these offsets.
 *
 * The exertion levels are chosen so no cluster can push another out of its band when the two
 * windows overlap — the moderate day tops out at 4 + 4 = 8, exactly its own `high` threshold,
 * and the high day floors at 5 + 5 = 10.
 */
export function buildCalendarBandLessons(now: Date, timezone: string): { at: Date; exertionLevel: number }[] {
  // #1361's lesson, and every offset here hangs off it: the form's grid is anchored on
  // `barnToday()`, so "today" has to be the barn's day and not the host's. In the last hours of
  // the barn's day the host's UTC clock has already rolled over — `dayOffset(now, 5)` is then
  // barn-day +6, and on the tightest grid (a 31-day month starting Saturday, viewed from its
  // last day) that is one day past the edge and the red day vanishes. Same rollover a month up
  // for the next-month anchor. Noon UTC keeps every one of these the day it says in every zone
  // the barn picker offers.
  const [barnYear, barnMonth, barnDate] = barnDay(now, timezone).split('-').map(Number)
  const fromBarnToday = (offset: number) => new Date(Date.UTC(barnYear, barnMonth - 1, barnDate + offset, 12))
  return [
    { at: fromBarnToday(DEV_CALENDAR_BAND_MODERATE_DAY_OFFSET), exertionLevel: 4 },
    { at: fromBarnToday(DEV_CALENDAR_BAND_HIGH_DAY_OFFSET), exertionLevel: 5 },
    { at: fromBarnToday(DEV_CALENDAR_BAND_HIGH_DAY_OFFSET), exertionLevel: 5 },
    { at: new Date(Date.UTC(barnYear, barnMonth, DEV_CALENDAR_BAND_NEXT_MONTH_DAY, 12)), exertionLevel: 4 },
  ]
}

// #1390: the seed set `owning_member_id` and one privilege row but never these three columns,
// so nothing on `dev-barn` or `/demo` ever showed a registered name or a note — which is why a
// rider's horse detail page could not be walked by hand at all. Deliberately partial, so the
// page's three states are all reachable without setup:
//   Butter  — both notes and a registered name; unowned, so trainers and Butter's privileged
//             rider (see the grant below) get the read-only rendering
//   Hazel   — feed notes only, exercising the drop-the-unset-row branch
//   Apple / Clover — left bare: Apple is where the manager walk fills these in itself, and
//             Clover is the horse phases 5 and 6 hand to a trainer/rider as owner, where the
//             empty editable form is the thing being checked
export const DEV_BUTTER_REGISTERED_NAME = 'Buttercream Dream'
export const DEV_BUTTER_FEED_NOTES = 'Two flakes of hay AM and PM, half scoop ration balancer with breakfast.'
export const DEV_BUTTER_MEDICATION_NOTES = 'Bute 1g daily with feed through the end of the month.'
export const DEV_HAZEL_FEED_NOTES = 'Soaked hay cubes only while stalled — no dry hay.'

export const DEV_MANAGER_2 = { email: 'manager2@dev.local', firstName: 'Morgan', lastName: 'Manager' }
// #950: kept out of DEV_TRAINERS so the existing i % trainerRowIds.length round-robin
// assigning the main seed lessons is untouched — this trainer gets exactly one lesson.
export const DEV_TRAINER_4 = { email: 'trainer4@dev.local', firstName: 'Drew', lastName: 'Trainer' }

export const PAYMENT_TYPES = ['venmo', 'zelle', 'cash', 'check', 'freshbooks'] as const

// #1038: real JPEGs rather than a 1x1 placeholder, since dev-photo seeding needs images a
// human can tell apart on the page. #1135 made scripts/data/ a tracked directory, so these
// are in every checkout — see docs/scripts/dev-data.md's Test assets section for the manifest.
const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data')

export const DEV_TIER_NAME = 'Normal Tier'
export const DEV_TIER_PRICE = 100
export const DEV_TIER_2_NAME = 'Premium Tier'
export const DEV_TIER_2_PRICE = 150
const DEV_INSTRUCTOR_CUT = 25

function dayOffset(base: Date, days: number, hour = 10): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}

export function drawBar(current: number, total: number, width = 20): string {
  const ratio = total <= 0 ? 0 : current / total
  const filled = Math.min(width, Math.max(0, Math.round(ratio * width)))
  return `[${'#'.repeat(filled)}${' '.repeat(width - filled)}]`
}

export function buildLessonDates(now: Date): Date[] {
  const dates: Date[] = []
  for (let m = 3; m >= 1; m--) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1))
    dates.push(dayOffset(monthStart, 4))
    dates.push(dayOffset(monthStart, 11))
    dates.push(dayOffset(monthStart, 18))
  }
  for (let i = 17; i >= 8; i--) {
    dates.push(dayOffset(now, -i))
  }
  const recentSlots: [number, number][] = [
    [-6, 9], [-6, 15],
    [-5, 9], [-5, 15],
    [-4, 9], [-4, 15],
    [-3, 9],
    [-2, 9],
    [-1, 9], [-1, 15],
  ]
  for (const [day, hour] of recentSlots) {
    dates.push(dayOffset(now, day, hour))
  }
  // now + 2h rather than a fixed hour, so it's always still upcoming today regardless of when the script runs
  dates.push(new Date(now.getTime() + 2 * 60 * 60 * 1000))
  for (let i = 1; i <= 5; i++) {
    dates.push(dayOffset(now, i))
  }
  return dates
}

export function isGroupLesson(i: number): boolean {
  return i % 5 === 0
}

export function getLessonVariation(i: number, tier1: { name: string; price: number }, tier2: { name: string; price: number }) {
  const useTier1 = i % 2 === 0
  return {
    fee: useTier1 ? tier1.price : tier2.price,
    tierName: useTier1 ? tier1.name : tier2.name,
    jumping: useTier1,
    exertionLevel: (i % 5) + 1,
  }
}

// Day -3 (index 25, group) and day +3 (index 32, normal) lessons both sit exactly on the
// ±3-day exhaustion window edge, so whether each is included depends on what time of day
// reset-db runs. Both routed to the retired horse so neither ever contaminates
// Apple/Butter/Clover's projected exhaustion total.
export const EXHAUSTION_PAST_BOUNDARY_INDEX = 25
export const EXHAUSTION_FUTURE_BOUNDARY_INDEX = 32

export const EXHAUSTION_TOPUP_DAYS_OFFSET = -1
export const EXHAUSTION_TOPUP_HOUR = 11
export const EXHAUSTION_TOPUP_EXERTION = 4

export function getLessonHorseAssignment(i: number, horseIds: string[], retiredHorseId: string) {
  if (i === EXHAUSTION_PAST_BOUNDARY_INDEX || i === EXHAUSTION_FUTURE_BOUNDARY_INDEX) {
    return { horseIds: [retiredHorseId], exertionLevels: [3] }
  }
  if (isGroupLesson(i)) {
    return { horseIds, exertionLevels: horseIds.map((_, hi) => ((Math.floor(i / 5) + hi) % 5) + 1) }
  }
  return { horseIds: [horseIds[i % horseIds.length]], exertionLevels: [(i % 5) + 1] }
}

export function computeExhaustionWindowTotals(now: Date, horseIds: string[], retiredHorseId: string): Record<string, number> {
  const dates = buildLessonDates(now)
  const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const totals: Record<string, number> = Object.fromEntries(horseIds.map((id) => [id, 0]))

  for (let i = 0; i < dates.length; i++) {
    if (dates[i] < windowStart || dates[i] > windowEnd) continue
    const assignment = getLessonHorseAssignment(i, horseIds, retiredHorseId)
    assignment.horseIds.forEach((hid, idx) => {
      if (hid in totals) totals[hid] += assignment.exertionLevels[idx]
    })
  }

  const topupDate = dayOffset(now, EXHAUSTION_TOPUP_DAYS_OFFSET, EXHAUSTION_TOPUP_HOUR)
  if (topupDate >= windowStart && topupDate <= windowEnd) {
    totals[horseIds[2]] += EXHAUSTION_TOPUP_EXERTION
  }

  return totals
}

export function getPaymentType(i: number, isPast: boolean): string | null {
  if (!isPast) return null
  if (i % 5 === 4) return null
  return PAYMENT_TYPES[(i - Math.floor(i / 5)) % PAYMENT_TYPES.length]
}

export type ExpenseSeed = {
  daysOffset: number
  time: string | null
  amount: number | null
  recipient: string
  expenseType: string
  appliesToAllHorses: boolean
  horseIndex?: number
  paymentType?: string | null
}

export function expenseDateFor(now: Date, daysOffset: number): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + daysOffset)
  return d.toISOString().slice(0, 10)
}

export type HorseDocumentSeed = {
  horseIndex: number
  recordType: string
  fileName: string
  reminderDate: string | null
}

// #1559: two horse documents, not one. Butter's (the #1359 privilege fixture) carries a
// past-due reminder so the manager dashboard's due-documents card has real data; Apple's is
// the owner path — Apple is the rider-owned horse set below, so the Phase 6 Horses sweep has
// a document to open as owner — and deliberately has no reminder, preserving a "no reminder
// set" row for contrast. The reminder is derived from `now` (via expenseDateFor, which is
// just this file's generic YYYY-MM-DD-offset helper despite the expense-flavoured name)
// rather than a literal so it stays a believable "14 days overdue" on every reseed — not to
// keep it due at all: `getDueDocuments` filters `reminder_date <= today` with no lower bound,
// so a literal would still read as due months later, just absurdly so.
export const DEV_DUE_DOCUMENT_DAYS_AGO = 14

export function buildHorseDocumentSeeds(now: Date): HorseDocumentSeed[] {
  return [
    {
      horseIndex: 1,
      recordType: 'coggins',
      fileName: 'butter-coggins.pdf',
      reminderDate: expenseDateFor(now, -DEV_DUE_DOCUMENT_DAYS_AGO),
    },
    { horseIndex: 0, recordType: 'shot_record', fileName: 'apple-shot-record.pdf', reminderDate: null },
  ]
}

export function buildExpenseSeeds(now: Date): ExpenseSeed[] {
  // now + 2h rather than a fixed time, so it's always still upcoming (mirrors buildLessonDates).
  // Date and time are both derived from this same shifted instant so they can't disagree
  // about the calendar day when the shift crosses UTC midnight.
  const upcoming = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const todayOffset = Math.round(
    (Date.UTC(upcoming.getUTCFullYear(), upcoming.getUTCMonth(), upcoming.getUTCDate()) -
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      86400000
  )
  const todayTime = upcoming.toISOString().slice(11, 19)
  // #971 empty-state testing: barnCreatedAt is now 4 calendar months back, but buildLessonDates
  // only seeds lessons in the 3 months before that — so the barn's creation month itself has no
  // lessons. This priced expense (paymentType assigned below) gives that lesson-free month a
  // collected transaction, so its tables' empty states can be exercised against real data.
  const barnCreationMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 15))
  const barnCreationMonthOffset = Math.round(
    (Date.UTC(barnCreationMonthStart.getUTCFullYear(), barnCreationMonthStart.getUTCMonth(), barnCreationMonthStart.getUTCDate()) -
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) /
      86400000
  )
  const seeds: ExpenseSeed[] = [
    { daysOffset: barnCreationMonthOffset, time: null, amount: 150, recipient: 'Riverside Vet Clinic', expenseType: 'Veterinary', appliesToAllHorses: false, horseIndex: 0 },
    { daysOffset: -80, time: null, amount: 450, recipient: 'Barn Insurance Co.', expenseType: 'Insurance', appliesToAllHorses: true },
    { daysOffset: -75, time: null, amount: 85, recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', appliesToAllHorses: false, horseIndex: 0 },
    { daysOffset: -60, time: null, amount: 250, recipient: 'Riverside Vet Clinic', expenseType: 'Veterinary', appliesToAllHorses: true },
    { daysOffset: -47, time: null, amount: 85, recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', appliesToAllHorses: false, horseIndex: 1 },
    { daysOffset: -40, time: null, amount: 300, recipient: 'Tractor Supply Co.', expenseType: 'Feed', appliesToAllHorses: true },
    { daysOffset: -30, time: null, amount: 120, recipient: 'Riverside Vet Clinic', expenseType: 'Veterinary', appliesToAllHorses: false, horseIndex: 1 },
    { daysOffset: -19, time: null, amount: 90, recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', appliesToAllHorses: false, horseIndex: 2 },
    { daysOffset: -10, time: null, amount: 275, recipient: 'Riverside Vet Clinic', expenseType: 'Veterinary', appliesToAllHorses: true },
    { daysOffset: -5, time: null, amount: 90, recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', appliesToAllHorses: false, horseIndex: 0 },
    { daysOffset: -3, time: null, amount: 65, recipient: 'Saddle Up Supply', expenseType: 'Tack', appliesToAllHorses: false, horseIndex: 2 },
    // #872: past due (date+time already passed, amount still null) for Outstanding-resolve testing
    { daysOffset: -2, time: '09:00:00', amount: null, recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', appliesToAllHorses: false, horseIndex: 1 },
    { daysOffset: todayOffset, time: todayTime, amount: null, recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', appliesToAllHorses: false, horseIndex: 0 },
    { daysOffset: 2, time: '14:00:00', amount: null, recipient: 'Riverside Vet Clinic', expenseType: 'Veterinary', appliesToAllHorses: false, horseIndex: 1 },
    // #950: tomorrow, date-only (no time) and still unpriced — verifies a date-only planned
    // expense correctly stays off the dashboard's timed Barn Schedule widget
    { daysOffset: 1, time: null, amount: null, recipient: 'Big Sky Feed Co.', expenseType: 'Feed', appliesToAllHorses: true },
  ]
  // #872: give priced expenses payment-type variety (cycling through PAYMENT_TYPES, same
  // helper lessons/agreement charges already use) so the ledger's collected/uncollected
  // split has manually-testable data — planned expenses (amount still null) stay unpaid.
  let priced = 0
  return seeds.map((seed) => (seed.amount === null ? seed : { ...seed, paymentType: getPaymentType(priced++, true) }))
}

export type SeedBarnResult = {
  lessonDates: Date[]
  pastLessons: { id: string; lesson_type: string }[]
  expenseSeeds: ExpenseSeed[]
  defaultBoardFee: number
}

export async function seedBarn(
  supabase: SupabaseClient,
  barnId: string,
  barnSlug: string,
  managerUserId: string,
  now: Date = new Date(),
  emailDomain: string = 'dev.local'
): Promise<SeedBarnResult> {
  console.log(`Seeding barn ${barnSlug}…`)

  const email = (e: string) => withEmailDomain(e, emailDomain)

  const m2Profile = await upsertProfile(managerUserId, email(DEV_MANAGER_2.email), DEV_MANAGER_2.firstName, DEV_MANAGER_2.lastName, supabase)
  const m2Membership = mustSucceed<{ id: string }>(
    await supabase.from('barn_memberships').insert({
      user_id: managerUserId,
      profile_id: m2Profile.id,
      barn_id: barnId,
      role: 'manager',
      status: 'active',
      can_instruct: true,
    }).select('id').single(),
    'insert manager2 membership'
  )

  // #863: a few pre-filled contact info rows so Contact Info visibility can be
  // manually verified without hand-entering data; the rest stay blank ("—")
  // to also exercise the missing-field case.
  await updateContactInfo(
    m2Profile.id,
    { phone: '555-0101', emergency_contact_name: 'Riley Manager', emergency_contact_phone: '555-0102' },
    supabase
  )

  const tier1 = await createTier(barnId, DEV_TIER_NAME, DEV_TIER_PRICE, true, 3, false, DEV_INSTRUCTOR_CUT, supabase)
  const tier2 = await createTier(barnId, DEV_TIER_2_NAME, DEV_TIER_2_PRICE, false, null, null, DEV_INSTRUCTOR_CUT, supabase)

  const trainerIds: string[] = []
  for (const t of DEV_TRAINERS) {
    trainerIds.push(await findOrCreateAuthUser(email(t.email), supabase))
  }

  const riderIds: string[] = []
  for (const r of DEV_RIDERS) {
    riderIds.push(await findOrCreateAuthUser(email(r.email), supabase))
  }

  const trainerProfileIds: string[] = []
  for (let i = 0; i < DEV_TRAINERS.length; i++) {
    const p = await upsertProfile(trainerIds[i], email(DEV_TRAINERS[i].email), DEV_TRAINERS[i].firstName, DEV_TRAINERS[i].lastName, supabase)
    trainerProfileIds.push(p.id)
  }

  const riderProfileIds: string[] = []
  for (let i = 0; i < DEV_RIDERS.length; i++) {
    const p = await upsertProfile(riderIds[i], email(DEV_RIDERS[i].email), DEV_RIDERS[i].firstName, DEV_RIDERS[i].lastName, supabase)
    riderProfileIds.push(p.id)
  }

  await updateContactInfo(
    trainerProfileIds[0],
    { phone: '555-0201', emergency_contact_name: 'Sam Trainer', emergency_contact_phone: '555-0202' },
    supabase
  )
  await updateContactInfo(
    riderProfileIds[0],
    { phone: '555-0301', emergency_contact_name: 'Jamie Rider', emergency_contact_phone: '555-0302' },
    supabase
  )

  // #1004: Emery has a photo pre-set so "view another member's photo, read-only" is
  // manually testable without a live upload (which the change-user.sh role swap can't
  // do for a self-write — see checklists/pre-release/phase-6-rider.md's note).
  // #505: the existsSync guard stays even though #1135 made scripts/data/ tracked — Next's
  // file tracer won't follow the runtime-computed DATA_DIR path, so these files may still be
  // absent from the deployed bundle where /demo calls seedBarn(). Skip rather than crash.
  const emeryPhotoPath = join(DATA_DIR, 'emery-photo.jpg')
  if (existsSync(emeryPhotoPath)) {
    const emeryPhotoBytes = readFileSync(emeryPhotoPath)
    const emeryPhotoFile = new File([emeryPhotoBytes], 'emery-photo.jpg', { type: 'image/jpeg' })
    await replaceProfilePhoto(riderProfileIds[1], barnId, emeryPhotoFile, 'jpg', supabase)
  }

  mustSucceed(
    await supabase.from('barn_memberships').insert(
      trainerIds.map((id, i) => ({ user_id: id, profile_id: trainerProfileIds[i], barn_id: barnId, role: 'trainer', status: 'active', can_instruct: true }))
    ),
    'insert trainer memberships'
  )

  mustSucceed(
    await supabase.from('barn_memberships').insert(
      riderIds.map((id, i) => ({ user_id: id, profile_id: riderProfileIds[i], barn_id: barnId, role: 'rider', status: 'active' }))
    ),
    'insert rider memberships'
  )

  // #950: 4th trainer, created outside DEV_TRAINERS/trainerRowIds so it doesn't disturb the
  // existing round-robin instructor assignment — gets exactly one ($0 comped) lesson below.
  const t4UserId = await findOrCreateAuthUser(email(DEV_TRAINER_4.email), supabase)
  const t4Profile = await upsertProfile(t4UserId, email(DEV_TRAINER_4.email), DEV_TRAINER_4.firstName, DEV_TRAINER_4.lastName, supabase)
  const t4Membership = mustSucceed<{ id: string }>(
    await supabase.from('barn_memberships').insert({
      user_id: t4UserId,
      profile_id: t4Profile.id,
      barn_id: barnId,
      role: 'trainer',
      status: 'active',
      can_instruct: true,
    }).select('id').single(),
    'insert trainer4 membership'
  )

  const allRiderMembers = await getActiveMembersWithProfiles(barnId, 'rider', supabase)
  const riderRowIds = riderIds.map((uid) => {
    const m = allRiderMembers.find((mem) => mem.userId === uid)
    if (!m) throw new Error(`active membership not found for user ${uid}`)
    return m.membershipId
  })

  const allTrainerMembers = await getActiveMembersWithProfiles(barnId, 'trainer', supabase)
  const trainerRowIds = trainerIds.map((uid) => {
    const m = allTrainerMembers.find((mem) => mem.userId === uid)
    if (!m) throw new Error(`active membership not found for user ${uid}`)
    return m.membershipId
  })

  // #1549: every horse has an owner (`horses.owning_member_id` is NOT NULL), and the seed spreads
  // them across all three roles so a manual walk can read each case without editing anything first
  // — Apple is rider-owned (the #998 fixture, now set at creation rather than by a later UPDATE),
  // Butter and Clover are manager-owned like anything a manager adds through the form, and the
  // calendar-band horse below is trainer-owned.
  const horseOwners = [riderRowIds[0], m2Membership.id, m2Membership.id]
  const horseIds: string[] = []
  for (const [index, name] of DEV_HORSES.entries()) {
    const horse = await createHorse(barnId, name, horseOwners[index], supabase)
    horseIds.push(horse.id)
  }

  // #1038: Butter has a photo pre-set so rider/trainer read-only photo-display checklist
  // steps have real backing data (mirrors Emery's profile photo above). See the #505 note
  // above for why the existsSync guard is still required.
  const butterPhotoPath = join(DATA_DIR, 'butter-photo.jpg')
  if (existsSync(butterPhotoPath)) {
    const butterPhotoBytes = readFileSync(butterPhotoPath)
    const butterPhotoFile = new File([butterPhotoBytes], 'butter-photo.jpg', { type: 'image/jpeg' })
    await replaceHorsePhoto(horseIds[1], barnId, butterPhotoFile, 'jpg', supabase)
  }

  const retiredHorse = await createHorse(barnId, DEV_RETIRED_HORSE, m2Membership.id, supabase)

  const unavailableHorse = await createHorse(barnId, DEV_UNAVAILABLE_HORSE, m2Membership.id, supabase)
  mustSucceed(
    await supabase.from('horses').update({
      is_available: false,
      unavailability_reason: DEV_UNAVAILABLE_REASON,
      feed_notes: DEV_HAZEL_FEED_NOTES,
    }).eq('id', unavailableHorse.id),
    'mark seed horse unavailable'
  )

  // #1413 — see the DEV_CALENDAR_BAND_* constants above. Available and active, unlike the two
  // horses either side of it: the manual line selects it on the New Lesson form, which offers
  // neither an unavailable nor a retired horse.
  const calendarBandHorse = await createHorse(barnId, DEV_CALENDAR_BAND_HORSE, trainerRowIds[0], supabase)
  mustSucceed(
    await supabase.from('horses').update({
      exhaustion_threshold_moderate: DEV_CALENDAR_BAND_THRESHOLDS.moderate,
      exhaustion_threshold_high: DEV_CALENDAR_BAND_THRESHOLDS.high,
    }).eq('id', calendarBandHorse.id),
    'set calendar-band seed horse thresholds'
  )

  // See the DEV_BUTTER_* constants above for why only this horse gets the full set.
  mustSucceed(
    await supabase.from('horses').update({
      registered_name: DEV_BUTTER_REGISTERED_NAME,
      feed_notes: DEV_BUTTER_FEED_NOTES,
      medication_notes: DEV_BUTTER_MEDICATION_NOTES,
    }).eq('id', horseIds[1]),
    'seed horse registered name and notes'
  )

  // #998 manual-testability seed data: a privileged grant on a horse the granted rider does not
  // own (Access section). The owner half moved into the createHorse calls above when #1549 made
  // the column NOT NULL.
  mustSucceed(
    await supabase.from('member_horse_privileges').insert({
      barn_id: barnId,
      horse_id: horseIds[1],
      member_id: riderRowIds[1],
      document_privileges: 'read',
      lesson_read_privileges: true,
    }),
    'seed horse privilege grant'
  )

  // #1359: a document on the privileged horse, so the read grant above is manually visible —
  // pre-fix, a document row here was exactly what 500'd the horse page for the granted rider.
  // #1559 added the second one — see buildHorseDocumentSeeds for what each is for.
  // Same existsSync guard as the photos (see the #505 note above).
  const horseDocPath = join(DATA_DIR, 'test_1_kb.pdf')
  if (existsSync(horseDocPath)) {
    const horseDocBytes = readFileSync(horseDocPath)
    for (const doc of buildHorseDocumentSeeds(now)) {
      const storagePath = `${barnId}/horses/${horseIds[doc.horseIndex]}/${doc.fileName}`
      mustSucceed(
        await supabase.storage.from('documents').upload(storagePath, horseDocBytes, {
          contentType: 'application/pdf',
          upsert: true,
        }),
        'upload seed horse document'
      )
      mustSucceed(
        await supabase.from('horse_documents').insert({
          barn_id: barnId,
          horse_id: horseIds[doc.horseIndex],
          record_type: doc.recordType,
          storage_path: storagePath,
          file_name: doc.fileName,
          file_size: horseDocBytes.length,
          reminder_date: doc.reminderDate,
        }),
        'seed horse document row'
      )
    }
  }

  const lessonDates = buildLessonDates(now)
  const lessonTotal = lessonDates.length

  process.stdout.write(`Seeding lessons ${drawBar(0, lessonTotal)} 0/${lessonTotal}`)
  for (let i = 0; i < lessonDates.length; i++) {
    const instructorId = trainerRowIds[i % trainerRowIds.length]
    const { fee, jumping, tierName } = getLessonVariation(i, tier1, tier2)
    const isGroup = isGroupLesson(i)
    const { horseIds: lessonHorseIds, exertionLevels } = getLessonHorseAssignment(i, horseIds, retiredHorse.id)

    await createLessonWithParticipants({
      barnId,
      instructorId,
      lessonAt: lessonDates[i].toISOString(),
      fee,
      horseIds: lessonHorseIds,
      exertionLevels,
      riderIds: isGroup ? riderRowIds : [riderRowIds[i % riderRowIds.length]],
      lessonType: isGroup ? 'group' : 'normal',
      jumping,
      tierName,
    }, supabase)

    process.stdout.write(`\rSeeding lessons ${drawBar(i + 1, lessonTotal)} ${i + 1}/${lessonTotal}`)
  }
  process.stdout.write('\n')

  await createLessonWithParticipants({
    barnId,
    instructorId: trainerRowIds[0],
    lessonAt: dayOffset(now, EXHAUSTION_TOPUP_DAYS_OFFSET, EXHAUSTION_TOPUP_HOUR).toISOString(),
    fee: tier1.price,
    horseIds: [horseIds[2]],
    exertionLevels: [EXHAUSTION_TOPUP_EXERTION],
    riderIds: [riderRowIds[0]],
    lessonType: 'normal',
    jumping: false,
    tierName: tier1.name,
  }, supabase)

  const { timezone } = mustSucceed<{ timezone: string }>(
    await supabase.from('barns').select('timezone').eq('id', barnId).single(),
    'select barn timezone'
  )

  // #1413: the two lessons that put one amber day and one red day on the New Lesson form's
  // month calendar for DEV_CALENDAR_BAND_HORSE. `buildCalendarBandLessons` is the shared
  // definition so `seed-barn.test.ts` can check the guarantee against the real
  // `computeDayDecorations` rather than against a restatement of these offsets.
  for (const { at, exertionLevel } of buildCalendarBandLessons(now, timezone)) {
    await createLessonWithParticipants({
      barnId,
      instructorId: trainerRowIds[0],
      lessonAt: at.toISOString(),
      fee: tier1.price,
      horseIds: [calendarBandHorse.id],
      exertionLevels: [exertionLevel],
      riderIds: [riderRowIds[0]],
      lessonType: 'normal',
      jumping: false,
      tierName: tier1.name,
    }, supabase)
  }

  await createLessonSeries({
    barnId,
    instructorId: trainerRowIds[0],
    lessonAt: dayOffset(now, 7).toISOString(),
    fee: tier1.price,
    horseIds: [horseIds[0]],
    exertionLevels: [3],
    riderIds: [riderRowIds[0]],
    lessonType: 'normal',
    jumping: false,
    tierName: tier1.name,
  }, supabase)

  for (const daysAgo of [75, 60]) {
    await createLessonWithParticipants({
      barnId,
      instructorId: trainerRowIds[0],
      lessonAt: dayOffset(now, -daysAgo).toISOString(),
      fee: tier1.price,
      horseIds: [retiredHorse.id],
      exertionLevels: [3],
      riderIds: [riderRowIds[0]],
      lessonType: 'normal',
      jumping: false,
      tierName: tier1.name,
    }, supabase)
  }

  mustSucceed(
    await supabase.from('horses').update({
      is_active: false,
      deactivated_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', retiredHorse.id),
    'retire seed horse'
  )

  // #950: at least one Custom-tier lesson (no tier selected) — #934's Phase 3 walkthrough
  // references this seeded lesson directly instead of having the tester create one. Fee
  // deliberately avoids DEV_TIER_PRICE/DEV_TIER_2_PRICE so the tier-name backfill queries
  // below don't reclassify it away from 'Custom'.
  await createLessonWithParticipants({
    barnId,
    instructorId: trainerRowIds[0],
    lessonAt: dayOffset(now, -6, 13).toISOString(),
    fee: 90,
    horseIds: [horseIds[0]],
    exertionLevels: [3],
    riderIds: [riderRowIds[0]],
    lessonType: 'normal',
    jumping: false,
  }, supabase)

  // #950: 4th trainer's single $0 comped lesson — sync_lesson_transactions auto-collects any
  // fee=0 lesson regardless of payment_type, so no separate "mark paid" step is needed. The
  // membership stays intact; removing it is the manual "-> No instructor row" test step itself.
  await createLessonWithParticipants({
    barnId,
    instructorId: t4Membership.id,
    lessonAt: dayOffset(now, -8, 9).toISOString(),
    fee: 0,
    horseIds: [horseIds[1]],
    exertionLevels: [2],
    riderIds: [riderRowIds[1]],
    lessonType: 'normal',
    jumping: false,
    tierName: tier1.name,
  }, supabase)

  // #950: Morgan (manager2) also instructs — today and tomorrow so a manager-instructor
  // shows up in "By Instructor" filtering same as a trainer would. now + 2h (not a fixed
  // hour) matches buildLessonDates'/buildExpenseSeeds' own "today" lessons, so it's always
  // still upcoming today regardless of when the script runs.
  await createLessonWithParticipants({
    barnId,
    instructorId: m2Membership.id,
    lessonAt: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    fee: tier1.price,
    horseIds: [horseIds[1]],
    exertionLevels: [3],
    riderIds: [riderRowIds[1]],
    lessonType: 'normal',
    jumping: false,
    tierName: tier1.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId,
    instructorId: m2Membership.id,
    lessonAt: dayOffset(now, 1, 10).toISOString(),
    fee: tier1.price,
    horseIds: [horseIds[2]],
    exertionLevels: [3],
    riderIds: [riderRowIds[2]],
    lessonType: 'normal',
    jumping: false,
    tierName: tier1.name,
  }, supabase)

  // #950: a 3rd Morgan lesson, older than 7 days, so the Lessons list's recent/older split is
  // verifiable even when filtered down to a single (manager-)instructor. Also doubles as the
  // notes-display fixture below rather than seeding a separate lesson for that.
  const morganOlderLesson = await createLessonWithParticipants({
    barnId,
    instructorId: m2Membership.id,
    lessonAt: dayOffset(now, -10, 9).toISOString(),
    fee: tier1.price,
    horseIds: [horseIds[0]],
    exertionLevels: [3],
    riderIds: [riderRowIds[0]],
    lessonType: 'normal',
    jumping: false,
    tierName: tier1.name,
  }, supabase)

  // #950: horse/rider/private notes so notes-display (not just notes-hidden-when-empty) is
  // verifiable against seed data. updateLessonHorseNotes/updateLessonRiderNotes always call
  // createClient() (no client param), which needs a request context this standalone script
  // doesn't have — so this uses the raw-table escape hatch (no usable DAL equivalent, per
  // scripts/CLAUDE.md's "no db layer equivalent exists" case).
  mustSucceed(
    await supabase
      .from('lesson_horses')
      .update({ horse_notes: 'Favored the left lead through changes.' })
      .eq('lesson_id', morganOlderLesson.id)
      .eq('horse_id', horseIds[0]),
    'seed lesson horse notes'
  )
  mustSucceed(
    await supabase
      .from('lesson_riders')
      .update({
        rider_notes: 'Worked on posting trot diagonals.',
        private_notes: 'Consider moving up to a livelier horse next month.',
      })
      .eq('lesson_id', morganOlderLesson.id)
      .eq('rider_id', riderRowIds[0]),
    'seed lesson rider notes'
  )

  mustSucceed(
    await supabase.from('lessons').update({ tier_name: DEV_TIER_NAME }).eq('barn_id', barnId).eq('fee', DEV_TIER_PRICE),
    'update lesson tier names tier 1'
  )
  mustSucceed(
    await supabase.from('lessons').update({ tier_name: DEV_TIER_2_NAME }).eq('barn_id', barnId).eq('fee', DEV_TIER_2_PRICE),
    'update lesson tier names tier 2'
  )

  const pastLessons = mustSucceed(
    await supabase
      .from('lessons')
      .select('id, lesson_type')
      .eq('barn_id', barnId)
      .lt('lesson_at', now.toISOString())
      .order('lesson_at', { ascending: true }),
    'fetch past lessons'
  )

  const ptGroups: Record<string, string[]> = {}
  for (let i = 0; i < pastLessons.length; i++) {
    const pt = getPaymentType(i, true)
    if (pt) { (ptGroups[pt] ??= []).push(pastLessons[i].id) }
  }
  for (const [pt, ids] of Object.entries(ptGroups)) {
    // #827: createLessonWithParticipants already created the paired lesson_fee/instructor_payout
    // transaction rows (uncollected); collect_lesson_payment's own auth check would reject a
    // service-role caller (auth.uid() is null), so mark them collected via a raw update instead,
    // per scripts/CLAUDE.md's guidance for RPCs with auth checks that block service-role callers.
    mustSucceed(
      await supabase
        .from('transactions')
        .update({ collected: true, payment_type: pt })
        .eq('barn_id', barnId)
        .in('lesson_id', ids)
        .in('kind', ['lesson_fee', 'instructor_payout']),
      `sync transactions collected for payment_type ${pt}`
    )
  }

  const cancelledLesson = pastLessons[0]
  mustSucceed(
    await supabase
      .from('lessons')
      .update({ cancelled_at: now.toISOString(), fee: 0, cancellation_notes: 'Seeded example cancellation' })
      .eq('id', cancelledLesson.id),
    'cancel seeded lesson'
  )

  const cancelledRiderLesson = pastLessons.find((l: { id: string; lesson_type: string }) => l.lesson_type === 'group' && l.id !== cancelledLesson.id)
  if (cancelledRiderLesson) {
    mustSucceed(
      await supabase
        .from('lesson_riders')
        .update({ cancelled_at: now.toISOString(), cancellation_notes: 'Seeded example participation cancellation' })
        .eq('lesson_id', cancelledRiderLesson.id)
        .eq('rider_id', riderRowIds[0]),
      'cancel seeded rider participation'
    )
  }

  const defaultBoardFee = await getBarnDefaultBoardFee(barnId, supabase)
  // #1361: generateChargeForMonth resolves the month in the barn's frame, so these anchors
  // have to be instants that fall inside the intended month *there* — both the month counted
  // back from and the day within it. The month comes from the barn's own calendar, since in
  // the last hours of the barn's month the host's UTC clock has already rolled into the next
  // one, and `monthsAgo(1)` would then land on the barn's *current* month — colliding with
  // the charge `createAgreement` just made, which `generate_agreement_charge` silently
  // no-ops on. The day is the 15th at noon UTC, which is the 15th in every zone the barn
  // picker offers (midnight UTC on the 1st is the previous month in all of them).
  const [barnYear, barnMonth] = barnDay(now, timezone).split('-').map(Number)
  const monthsAgo = (n: number) => new Date(Date.UTC(barnYear, barnMonth - 1 - n, 15, 12))
  const lastMonth = monthsAgo(1)

  const boardAgreement = await createAgreement(
    { barnId, riderId: riderRowIds[0], horseId: horseIds[0], fee: defaultBoardFee, kind: 'board', cadence: 'monthly' },
    supabase
  )
  const boardLastMonthCharge = await generateChargeForMonth(boardAgreement.id, barnId, timezone, lastMonth, supabase)

  const leaseAgreement = await createAgreement(
    { barnId, riderId: riderRowIds[1], horseId: horseIds[1], fee: 200, kind: 'lease', cadence: 'monthly' },
    supabase
  )
  const leaseLastMonthCharge = await generateChargeForMonth(leaseAgreement.id, barnId, timezone, lastMonth, supabase)

  // second, simultaneously-active agreement for the same rider (Emery) — exercises the
  // member detail page's multi-card Active Agreements view (#772)
  const emeryBoardAgreement = await createAgreement(
    { barnId, riderId: riderRowIds[1], horseId: horseIds[2], fee: defaultBoardFee, kind: 'board', cadence: 'monthly' },
    supabase
  )
  const emeryBoardLastMonthCharge = await generateChargeForMonth(emeryBoardAgreement.id, barnId, timezone, lastMonth, supabase)

  // Two-months-ago charges left unpaid so the Outstanding page/section always has a
  // past-due board and lease charge to manually verify without hand-seeding (#865 testing).
  const twoMonthsAgo = monthsAgo(2)
  await generateChargeForMonth(boardAgreement.id, barnId, timezone, twoMonthsAgo, supabase)
  await generateChargeForMonth(leaseAgreement.id, barnId, timezone, twoMonthsAgo, supabase)

  // mark_agreement_charge_paid has no service-role escape hatch (interactive-only RPC,
  // see ARCHITECTURE.md) so this seed script can't call it — raw update to transactions
  // instead, mirroring what the RPC itself would write (agreement_charges.payment_type
  // is no longer written by that RPC either, #885).
  mustSucceed(
    await supabase
      .from('transactions')
      .update({ collected: true, payment_type: 'zelle' })
      .in('agreement_charge_id', [boardLastMonthCharge.id, leaseLastMonthCharge.id, emeryBoardLastMonthCharge.id]),
    'mark last-month agreement-charge transactions collected'
  )

  const expenseSeeds = buildExpenseSeeds(now)
  for (const seed of expenseSeeds) {
    await createExpense(barnId, {
      expenseDate: expenseDateFor(now, seed.daysOffset),
      expenseTime: seed.time,
      amount: seed.amount,
      recipient: seed.recipient,
      expenseType: seed.expenseType,
      appliesToAllHorses: seed.appliesToAllHorses,
      horseIds: seed.appliesToAllHorses ? undefined : [horseIds[seed.horseIndex!]],
      paymentType: (seed.paymentType ?? null) as PaymentType | null,
    }, supabase)
  }

  return { lessonDates, pastLessons, expenseSeeds, defaultBoardFee }
}
