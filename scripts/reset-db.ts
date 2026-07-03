import { fileURLToPath } from 'url'
import { upsertProfile } from '@/lib/db/profiles'
import { createTier } from '@/lib/db/lesson-tiers'

import { createHorse } from '@/lib/db/horses'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { createPendingMembership, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { mustSucceed, createServiceClient, teardownAllData } from './script-utils'

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

function dayOffset(base: Date, days: number, hour = 10): Date {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hour, 0, 0, 0)
  return d
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
  for (let i = 1; i <= 5; i++) {
    dates.push(dayOffset(now, i))
  }
  return dates
}

export function isGroupLesson(i: number): boolean {
  return i % 5 === 0
}

export function getLessonVariation(i: number, tier1: { name: string; price: number | null }, tier2: { name: string; price: number | null }) {
  const useTier1 = i % 2 === 0
  return {
    fee: useTier1 ? tier1.price : tier2.price,
    tierName: useTier1 ? tier1.name : tier2.name,
    jumping: useTier1,
    exertionLevel: (i % 5) + 1,
  }
}

export function getPaymentType(i: number, isPast: boolean): string | null {
  if (!isPast) return null
  if (i % 5 === 4) return null
  return PAYMENT_TYPES[(i - Math.floor(i / 5)) % PAYMENT_TYPES.length]
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

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

  const tier1 = await createTier(DEV_BARN_ID, DEV_TIER_NAME, DEV_TIER_PRICE, true, 3, false, supabase)
  const tier2 = await createTier(DEV_BARN_ID, DEV_TIER_2_NAME, DEV_TIER_2_PRICE, false, null, null, supabase)

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

  const horseIds: string[] = []
  for (const name of DEV_HORSES) {
    const horse = await createHorse(DEV_BARN_ID, name, supabase)
    horseIds.push(horse.id)
  }

  const retiredHorse = await createHorse(DEV_BARN_ID, DEV_RETIRED_HORSE, supabase)

  const lessonDates = buildLessonDates(now)

  for (let i = 0; i < lessonDates.length; i++) {
    const instructorId = trainerIds[i % trainerIds.length]
    const { fee, jumping, exertionLevel, tierName } = getLessonVariation(i, tier1, tier2)
    const isGroup = isGroupLesson(i)

    await createLessonWithParticipants({
      barnId: DEV_BARN_ID,
      instructorId,
      lessonAt: lessonDates[i].toISOString(),
      fee,
      horseIds: isGroup ? horseIds : [horseIds[i % horseIds.length]],
      exertionLevels: isGroup ? horseIds.map((_, hi) => ((Math.floor(i / 5) + hi) % 5) + 1) : [exertionLevel],
      riderIds: isGroup ? riderRowIds : [riderRowIds[i % riderRowIds.length]],
      lessonType: isGroup ? 'group' : 'normal',
      jumping,
      tierName,
    }, supabase)
  }

  for (const daysAgo of [75, 60]) {
    await createLessonWithParticipants({
      barnId: DEV_BARN_ID,
      instructorId: trainerIds[0],
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
      .select('id')
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

  const paidCount = pastLessons.filter((_: unknown, i: number) => getPaymentType(i, true) !== null).length
  const groupCount = lessonDates.filter((_, i) => isGroupLesson(i)).length

  console.log('Done. Dev database reset to known state:')
  console.log(`  Barn:     ${DEV_BARN_NAME} (slug: ${DEV_BARN_SLUG})`)
  console.log(`  Manager2: ${DEV_MANAGER_2.email} (can_instruct=true — appears in instructor dropdown)`)
  console.log(`  Trainers: ${DEV_TRAINERS.map((t) => t.email).join(', ')}`)
  console.log(`  Riders:   ${DEV_RIDERS.map((r) => r.email).join(', ')}`)
  console.log(`  Pending:  ${DEV_PENDING_RIDER.email} (${DEV_PENDING_RIDER.firstName} ${DEV_PENDING_RIDER.lastName}, awaiting approval)`)
  console.log(`  Horses:   ${DEV_HORSES.join(', ')}, plus ${DEV_RETIRED_HORSE} (retired, deactivated_at 30 days ago, 2 past lessons)`)
  console.log(`  Tiers:    ${DEV_TIER_NAME} ($${DEV_TIER_PRICE}, default), ${DEV_TIER_2_NAME} ($${DEV_TIER_2_PRICE})`)
  console.log(`  Lessons:  ${lessonDates.length + 2} (${groupCount} group, ${lessonDates.length - groupCount} normal, plus 2 for ${DEV_RETIRED_HORSE}; 9 across prior 3 months, 10 older than 1 week, 10 within past week, 5 next week) — alternating tiers, jumping, exertion 1–5; ~${paidCount} of ${pastLessons.length} past lessons marked paid`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('reset-db failed:', err.message)
    process.exit(1)
  })
}
