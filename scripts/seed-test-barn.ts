// Email/password provider must be enabled in the Supabase dashboard:
// Authentication → Providers → Email (one-time manual step per project).
//
// Test user credentials follow this scheme:
//   email:    <role>@<barn-slug>.e2e  (e.g. manager@test-barn-pr-99.e2e)
//   password: TestPass123!
//
// Playwright tests should hardcode these patterns to derive credentials from the slug.

import { fileURLToPath } from 'url'
import { upsertProfile } from '@/lib/db/profiles'
import { createTier } from '@/lib/db/lesson-tiers'
import { createRider } from '@/lib/db/riders'
import { createHorse } from '@/lib/db/horses'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { teardown } from './teardown-test-barn'
import { mustSucceed, createServiceClient } from './script-utils'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BARN_SLUG = process.env.TEST_BARN_SLUG

const TEST_PASSWORD = 'TestPass123!'

export function buildTestUserEmail(barnSlug: string, role: string): string {
  return `${role}@${barnSlug}.e2e`
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!BARN_SLUG) throw new Error('TEST_BARN_SLUG is required')

  const supabase = createServiceClient(SUPABASE_URL!, SERVICE_ROLE_KEY!)

  console.log(`Tearing down existing barn: ${BARN_SLUG}…`)
  await teardown(BARN_SLUG, supabase)

  console.log(`Seeding test barn: ${BARN_SLUG}…`)

  const barnName = BARN_SLUG
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  mustSucceed(
    await supabase.from('barns').insert({ name: barnName, slug: BARN_SLUG }),
    'insert barn'
  )

  const { data: barn } = await supabase.from('barns').select('id').eq('slug', BARN_SLUG).single()
  if (!barn) throw new Error('barn not found after insert')
  const barnId = barn.id

  const createUser = async (role: string, firstName: string, lastName: string) => {
    const email = buildTestUserEmail(BARN_SLUG, role)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`create ${role}: ${error.message}`)
    if (!data?.user) throw new Error(`create ${role}: no user returned`)
    const userId = data.user.id
    await upsertProfile(userId, email, firstName, lastName, supabase)
    mustSucceed(
      await supabase.from('profiles').update({
        phone: '555-0100',
        emergency_contact_name: `${firstName} Emergency`,
        emergency_contact_phone: '555-0199',
      }).eq('user_id', userId),
      `update ${role} contact fields`
    )
    return userId
  }

  const managerId = await createUser('manager', 'Test', 'Manager')
  const trainerId = await createUser('trainer', 'Test', 'Trainer')
  const riderId = await createUser('rider', 'Test', 'Rider')

  mustSucceed(
    await supabase.from('barn_memberships').insert([
      { user_id: managerId, barn_id: barnId, role: 'manager', status: 'active', can_instruct: true },
      { user_id: trainerId, barn_id: barnId, role: 'trainer', status: 'active', can_instruct: true },
      { user_id: riderId,   barn_id: barnId, role: 'rider',   status: 'active', can_instruct: false },
    ]),
    'insert memberships'
  )

  const tier1 = await createTier(barnId, 'Standard', 80, true, null, null, supabase)
  const tier2 = await createTier(barnId, 'Premium', 120, false, null, null, supabase)

  const horse1 = await createHorse(barnId, 'Apollo', supabase)
  const horse2 = await createHorse(barnId, 'Bella', supabase)

  const rider1 = await createRider(barnId, 'Test Rider', riderId, supabase)
  const rider2 = await createRider(barnId, 'Anon Rider', undefined, supabase)

  const now = new Date()
  const past = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  const future = (daysAhead: number) =>
    new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString()

  await createLessonWithParticipants({
    barnId, instructorId: trainerId, lessonAt: past(5), fee: tier1.price,
    horseIds: [horse1.id], exertionLevels: [3], riderIds: [rider1.id],
    lessonType: 'normal', jumping: false, tierName: tier1.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerId, lessonAt: past(3), fee: tier2.price,
    horseIds: [horse2.id], exertionLevels: [4], riderIds: [rider1.id],
    lessonType: 'normal', jumping: true, tierName: tier2.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerId, lessonAt: past(1), fee: 80,
    horseIds: [horse1.id, horse2.id], exertionLevels: [3, 2], riderIds: [rider1.id, rider2.id],
    lessonType: 'group', jumping: false, tierName: 'Custom',
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerId, lessonAt: past(10), fee: tier1.price,
    horseIds: [horse2.id], exertionLevels: [2], riderIds: [rider1.id],
    lessonType: 'normal', jumping: false, tierName: tier1.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerId, lessonAt: future(2), fee: tier1.price,
    horseIds: [horse1.id], exertionLevels: [3], riderIds: [rider1.id],
    lessonType: 'normal', jumping: false, tierName: tier1.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerId, lessonAt: future(5), fee: tier2.price,
    horseIds: [horse2.id], exertionLevels: [5], riderIds: [rider1.id],
    lessonType: 'normal', jumping: true, tierName: tier2.name,
  }, supabase)

  mustSucceed(
    await supabase.from('lessons').update({ payment_type: 'venmo' })
      .eq('barn_id', barnId).lt('lesson_at', past(2)),
    'mark past lessons paid'
  )

  console.log(`Done. Test barn seeded:`)
  console.log(`  Barn:     ${barnName} (slug: ${BARN_SLUG}, id: ${barnId})`)
  console.log(`  Manager:  ${buildTestUserEmail(BARN_SLUG, 'manager')} / ${TEST_PASSWORD}`)
  console.log(`  Trainer:  ${buildTestUserEmail(BARN_SLUG, 'trainer')} / ${TEST_PASSWORD}`)
  console.log(`  Rider:    ${buildTestUserEmail(BARN_SLUG, 'rider')} / ${TEST_PASSWORD}`)
  console.log(`  Horses:   Apollo, Bella`)
  console.log(`  Tiers:    Standard ($80, default), Premium ($120)`)
  console.log(`  Lessons:  6 (4 past, 2 future; 1 group; 3 marked paid)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('seed-test-barn failed:', err.message)
    process.exit(1)
  })
}
