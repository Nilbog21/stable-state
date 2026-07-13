import { fileURLToPath } from 'url'
import { upsertProfile } from '@/lib/db/profiles'
import { createTier } from '@/lib/db/lesson-tiers'

import { createHorse } from '@/lib/db/horses'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { createPendingMembership, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { createAgreement, generateChargeForMonth, getBarnDefaultBoardFee } from '@/lib/db/agreements'
import { createExpense } from '@/lib/db/expenses'
import { mustSucceed, createServiceClient, teardownAllData, assertDevProject } from './script-utils'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const DEV_BARN_ID = '00000000-0000-0000-0000-000000000b41'
const DEV_BARN_SLUG = 'dev-barn'
const DEV_BARN_NAME = 'Dev Barn'

const DEV_TRAINERS = [
  { email: 'trainer1@dev.local', firstName: 'Alex',  lastName: 'Trainer' },
  { email: 'trainer2@dev.local', firstName: 'Blake', lastName: 'Trainer' },
  { email: 'trainer3@dev.local', firstName: 'Casey', lastName: 'Trainer' },
]

const DEV_RIDERS = [
  { email: 'rider1@dev.local', firstName: 'Dana',   lastName: 'Rider' },
  { email: 'rider2@dev.local', firstName: 'Emery',  lastName: 'Rider' },
  { email: 'rider3@dev.local', firstName: 'Finley', lastName: 'Rider' },
]

const DEV_HORSES = ['Apple', 'Butter', 'Clover']
const DEV_RETIRED_HORSE = 'Willow'

export const DEV_PENDING_RIDER = { email: 'pending1@dev.local', firstName: 'Quinn', lastName: 'Pending' }
export const DEV_MANAGER_2 = { email: 'manager2@dev.local', firstName: 'Morgan', lastName: 'Manager' }

export const PAYMENT_TYPES = ['venmo', 'zelle', 'cash', 'check', 'freshbooks'] as const

const DEV_TIER_NAME = 'Normal Tier'
const DEV_TIER_PRICE = 100
const DEV_TIER_2_NAME = 'Premium Tier'
const DEV_TIER_2_PRICE = 150
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
}

export function expenseDateFor(now: Date, daysOffset: number): string {
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + daysOffset)
  return d.toISOString().slice(0, 10)
}

export function buildExpenseSeeds(now: Date): ExpenseSeed[] {
  // now + 2h rather than a fixed time, so it's always still upcoming today
  // regardless of when the script runs (mirrors the today-dated lesson at buildLessonDates)
  const todayTime = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(11, 19)
  return [
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
    { daysOffset: 0, time: todayTime, amount: null, recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', appliesToAllHorses: false, horseIndex: 0 },
    { daysOffset: 2, time: '14:00:00', amount: null, recipient: 'Riverside Vet Clinic', expenseType: 'Veterinary', appliesToAllHorses: false, horseIndex: 1 },
  ]
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  assertDevProject(SUPABASE_URL)

  const supabase = createServiceClient(SUPABASE_URL!, SERVICE_ROLE_KEY!)

  console.log('Tearing down all data…')

  await teardownAllData(supabase)

  console.log('Re-seeding dev fixtures…')

  const now = new Date()
  const barnCreatedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString()

  mustSucceed(
    await supabase.from('barns').insert({ id: DEV_BARN_ID, name: DEV_BARN_NAME, slug: DEV_BARN_SLUG, created_at: barnCreatedAt }),
    'insert barn'
  )

  const { data: m2Data, error: m2Err } = await supabase.auth.admin.createUser({
    email: DEV_MANAGER_2.email,
    email_confirm: true,
  })
  if (m2Err) throw new Error(`create manager2: ${m2Err.message}`)
  const m2Profile = await upsertProfile(m2Data.user.id, DEV_MANAGER_2.email, DEV_MANAGER_2.firstName, DEV_MANAGER_2.lastName, supabase)
  mustSucceed(
    await supabase.from('barn_memberships').insert({
      user_id: m2Data.user.id,
      profile_id: m2Profile.id,
      barn_id: DEV_BARN_ID,
      role: 'manager',
      status: 'active',
      can_instruct: true,
    }),
    'insert manager2 membership'
  )

  const tier1 = await createTier(DEV_BARN_ID, DEV_TIER_NAME, DEV_TIER_PRICE, true, 3, false, DEV_INSTRUCTOR_CUT, supabase)
  const tier2 = await createTier(DEV_BARN_ID, DEV_TIER_2_NAME, DEV_TIER_2_PRICE, false, null, null, DEV_INSTRUCTOR_CUT, supabase)

  const trainerIds: string[] = []
  for (const t of DEV_TRAINERS) {
    const { data, error } = await supabase.auth.admin.createUser({ email: t.email, email_confirm: true })
    if (error) throw new Error(`create trainer ${t.email}: ${error.message}`)
    trainerIds.push(data.user.id)
  }

  const riderIds: string[] = []
  for (const r of DEV_RIDERS) {
    const { data, error } = await supabase.auth.admin.createUser({ email: r.email, email_confirm: true })
    if (error) throw new Error(`create rider ${r.email}: ${error.message}`)
    riderIds.push(data.user.id)
  }

  const trainerProfileIds: string[] = []
  for (let i = 0; i < DEV_TRAINERS.length; i++) {
    const p = await upsertProfile(trainerIds[i], DEV_TRAINERS[i].email, DEV_TRAINERS[i].firstName, DEV_TRAINERS[i].lastName, supabase)
    trainerProfileIds.push(p.id)
  }

  const riderProfileIds: string[] = []
  for (let i = 0; i < DEV_RIDERS.length; i++) {
    const p = await upsertProfile(riderIds[i], DEV_RIDERS[i].email, DEV_RIDERS[i].firstName, DEV_RIDERS[i].lastName, supabase)
    riderProfileIds.push(p.id)
  }

  mustSucceed(
    await supabase.from('barn_memberships').insert(
      trainerIds.map((id, i) => ({ user_id: id, profile_id: trainerProfileIds[i], barn_id: DEV_BARN_ID, role: 'trainer', status: 'active', can_instruct: true }))
    ),
    'insert trainer memberships'
  )

  mustSucceed(
    await supabase.from('barn_memberships').insert(
      riderIds.map((id, i) => ({ user_id: id, profile_id: riderProfileIds[i], barn_id: DEV_BARN_ID, role: 'rider', status: 'active' }))
    ),
    'insert rider memberships'
  )

  const { data: pendingData, error: pendingErr } = await supabase.auth.admin.createUser({
    email: DEV_PENDING_RIDER.email,
    email_confirm: true,
  })
  if (pendingErr) throw new Error(`create pending rider: ${pendingErr.message}`)
  const pendingUserId = pendingData.user.id

  const pendingProfile = await upsertProfile(pendingUserId, DEV_PENDING_RIDER.email, DEV_PENDING_RIDER.firstName, DEV_PENDING_RIDER.lastName, supabase)
  await createPendingMembership(pendingUserId, DEV_BARN_ID, 'rider', pendingProfile.id, supabase)

  const allRiderMembers = await getActiveMembersWithProfiles(DEV_BARN_ID, 'rider', supabase)
  const riderRowIds = riderIds.map((uid) => {
    const m = allRiderMembers.find((mem) => mem.userId === uid)
    if (!m) throw new Error(`active membership not found for user ${uid}`)
    return m.membershipId
  })

  const allTrainerMembers = await getActiveMembersWithProfiles(DEV_BARN_ID, 'trainer', supabase)
  const trainerRowIds = trainerIds.map((uid) => {
    const m = allTrainerMembers.find((mem) => mem.userId === uid)
    if (!m) throw new Error(`active membership not found for user ${uid}`)
    return m.membershipId
  })

  const horseIds: string[] = []
  for (const name of DEV_HORSES) {
    const horse = await createHorse(DEV_BARN_ID, name, supabase)
    horseIds.push(horse.id)
  }

  const retiredHorse = await createHorse(DEV_BARN_ID, DEV_RETIRED_HORSE, supabase)

  const lessonDates = buildLessonDates(now)
  const lessonTotal = lessonDates.length

  process.stdout.write(`Seeding lessons ${drawBar(0, lessonTotal)} 0/${lessonTotal}`)
  for (let i = 0; i < lessonDates.length; i++) {
    const instructorId = trainerRowIds[i % trainerRowIds.length]
    const { fee, jumping, tierName } = getLessonVariation(i, tier1, tier2)
    const isGroup = isGroupLesson(i)
    const { horseIds: lessonHorseIds, exertionLevels } = getLessonHorseAssignment(i, horseIds, retiredHorse.id)

    await createLessonWithParticipants({
      barnId: DEV_BARN_ID,
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
    barnId: DEV_BARN_ID,
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

  for (const daysAgo of [75, 60]) {
    await createLessonWithParticipants({
      barnId: DEV_BARN_ID,
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

  mustSucceed(
    await supabase.from('lessons').update({ tier_name: DEV_TIER_NAME }).eq('barn_id', DEV_BARN_ID).eq('fee', DEV_TIER_PRICE),
    'update lesson tier names tier 1'
  )
  mustSucceed(
    await supabase.from('lessons').update({ tier_name: DEV_TIER_2_NAME }).eq('barn_id', DEV_BARN_ID).eq('fee', DEV_TIER_2_PRICE),
    'update lesson tier names tier 2'
  )

  const pastLessons = mustSucceed(
    await supabase
      .from('lessons')
      .select('id, lesson_type')
      .eq('barn_id', DEV_BARN_ID)
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
    mustSucceed(
      await supabase.from('lessons').update({ payment_type: pt }).eq('barn_id', DEV_BARN_ID).in('id', ids),
      `update payment_type ${pt}`
    )
  }

  const cancelledLesson = pastLessons[0]
  mustSucceed(
    await supabase
      .from('lessons')
      .update({ cancelled_at: now.toISOString(), fee: 0, payment_type: null, cancellation_notes: 'Seeded example cancellation' })
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

  const paidCount = pastLessons.filter((_: unknown, i: number) => getPaymentType(i, true) !== null).length - 1
  const groupCount = lessonDates.filter((_, i) => isGroupLesson(i)).length

  const defaultBoardFee = await getBarnDefaultBoardFee(DEV_BARN_ID, supabase)
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))

  const boardAgreement = await createAgreement(
    { barnId: DEV_BARN_ID, riderId: riderRowIds[0], horseId: horseIds[0], fee: defaultBoardFee, kind: 'board', cadence: 'monthly' },
    supabase
  )
  const boardLastMonthCharge = await generateChargeForMonth(boardAgreement.id, DEV_BARN_ID, lastMonth, supabase)

  const leaseAgreement = await createAgreement(
    { barnId: DEV_BARN_ID, riderId: riderRowIds[1], horseId: horseIds[1], fee: 200, kind: 'lease', cadence: 'monthly' },
    supabase
  )
  const leaseLastMonthCharge = await generateChargeForMonth(leaseAgreement.id, DEV_BARN_ID, lastMonth, supabase)

  mustSucceed(
    await supabase.from('agreement_charges').update({ payment_type: 'zelle' }).in('id', [boardLastMonthCharge.id, leaseLastMonthCharge.id]),
    'mark last-month agreement charges paid'
  )

  const expenseSeeds = buildExpenseSeeds(now)
  for (const seed of expenseSeeds) {
    await createExpense(DEV_BARN_ID, {
      expenseDate: expenseDateFor(now, seed.daysOffset),
      expenseTime: seed.time,
      amount: seed.amount,
      recipient: seed.recipient,
      expenseType: seed.expenseType,
      appliesToAllHorses: seed.appliesToAllHorses,
      horseIds: seed.appliesToAllHorses ? undefined : [horseIds[seed.horseIndex!]],
    }, supabase)
  }
  const barnWideExpenseCount = expenseSeeds.filter((s) => s.appliesToAllHorses).length
  const plannedExpenseCount = expenseSeeds.filter((s) => s.amount === null).length

  console.log('Done. Dev database reset to known state:')
  console.log(`  Barn:     ${DEV_BARN_NAME} (slug: ${DEV_BARN_SLUG})`)
  console.log(`  Manager2: ${DEV_MANAGER_2.email} (can_instruct=true — appears in instructor dropdown)`)
  console.log(`  Trainers: ${DEV_TRAINERS.map((t) => t.email).join(', ')}`)
  console.log(`  Riders:   ${DEV_RIDERS.map((r) => r.email).join(', ')}`)
  console.log(`  Pending:  ${DEV_PENDING_RIDER.email} (${DEV_PENDING_RIDER.firstName} ${DEV_PENDING_RIDER.lastName}, awaiting approval)`)
  console.log(`  Horses:   ${DEV_HORSES.join(', ')}, plus ${DEV_RETIRED_HORSE} (retired, deactivated_at 30 days ago, 3 past lessons + 1 upcoming)`)
  console.log(`  Tiers:    ${DEV_TIER_NAME} ($${DEV_TIER_PRICE}, default), ${DEV_TIER_2_NAME} ($${DEV_TIER_2_PRICE})`)
  console.log(`  Lessons:  ${lessonDates.length + 3} (${groupCount} group, ${lessonDates.length - groupCount} normal, plus 1 exhaustion top-up for Clover and 2 for ${DEV_RETIRED_HORSE}; 9 across prior 3 months, 10 older than 1 week, 10 within past week, 1 today, 5 next week) — alternating tiers, jumping, exertion 1–5; ~${paidCount} of ${pastLessons.length} past lessons marked paid; 1 cancelled, 1 with a cancelled rider participation`)
  console.log(`  Agreements: 1 board ($${defaultBoardFee}), 1 lease ($200) — each with a paid charge last month and an unpaid charge this month`)
  console.log(`  Expenses: ${expenseSeeds.length} spanning ~80 days back to 10 days ahead (${barnWideExpenseCount} barn-wide, ${expenseSeeds.length - barnWideExpenseCount} per-horse; recurring Farrier and Veterinary recipients; ${plannedExpenseCount} planned with no amount yet)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('reset-db failed:', err.message)
    process.exit(1)
  })
}
