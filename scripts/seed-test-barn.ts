// Email/password provider must be enabled in the Supabase dashboard:
// Authentication → Providers → Email (one-time manual step per project).
//
// Test user credentials follow this scheme:
//   email:    <role>@<barn-slug>.e2e  (e.g. manager@test-barn-pr-99.e2e)
//   password: TestPass123!
//
// Playwright tests should hardcode these patterns to derive credentials from the slug.

import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { upsertProfile } from '@/lib/db/profiles'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { createTier } from '@/lib/db/lesson-tiers'

import { createHorse } from '@/lib/db/horses'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { createExpense } from '@/lib/db/expenses'
import { createAgreement } from '@/lib/db/agreements'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import { teardown } from './teardown-test-barn'
import { buildInvitePath } from './seed-account'
import { mustSucceed, createServiceClient, assertDevProject } from './script-utils'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BARN_SLUG = process.env.TEST_BARN_SLUG
const DEV_NAME = process.env.DEV_NAME

const TEST_PASSWORD = 'TestPass123!'

export function buildTestUserEmail(barnSlug: string, role: string): string {
  return `${role}@${barnSlug}.e2e`
}

// Mirrors seed-account.sh's `${DEV_NAME%% *}` / `${DEV_NAME#* }` bash split so both
// scripts derive the same first/last name from one DEV_NAME env var.
export function splitDevName(devName: string): { firstName: string; lastName: string } {
  const spaceIndex = devName.indexOf(' ')
  if (spaceIndex === -1) return { firstName: devName, lastName: '' }
  return { firstName: devName.slice(0, spaceIndex), lastName: devName.slice(spaceIndex + 1) }
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!BARN_SLUG) throw new Error('TEST_BARN_SLUG is required')
  if (!DEV_NAME) throw new Error('DEV_NAME is required')
  if (process.env.SEED_TEST_BARN_ALLOW_PROD !== 'true') assertDevProject(SUPABASE_URL)

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

  const { data: barn } = await supabase.from('barns').select('id, timezone').eq('slug', BARN_SLUG).single()
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
    const profile = await upsertProfile(userId, email, firstName, lastName, supabase)
    mustSucceed(
      await supabase.from('profiles').update({
        phone: '555-0100',
        emergency_contact_name: `${firstName} Emergency`,
        emergency_contact_phone: '555-0199',
      }).eq('user_id', userId),
      `update ${role} contact fields`
    )
    return { userId, profileId: profile.id }
  }

  const { userId: managerId, profileId: managerProfileId } = await createUser('manager', 'Test', 'Manager')
  const { userId: trainerId, profileId: trainerProfileId } = await createUser('trainer', 'Test', 'Trainer')
  const { userId: riderId,   profileId: riderProfileId   } = await createUser('rider', 'Test', 'Rider')
  const { userId: rider2Id,  profileId: rider2ProfileId  } = await createUser('rider2', 'Test', 'Rider2')

  mustSucceed(
    await supabase.from('barn_memberships').insert([
      { user_id: managerId, barn_id: barnId, role: 'manager', status: 'active', can_instruct: true,  profile_id: managerProfileId },
      { user_id: trainerId, barn_id: barnId, role: 'trainer', status: 'active', can_instruct: true,  profile_id: trainerProfileId },
      { user_id: riderId,   barn_id: barnId, role: 'rider',   status: 'active', can_instruct: false, profile_id: riderProfileId   },
      { user_id: rider2Id,  barn_id: barnId, role: 'rider',   status: 'active', can_instruct: false, profile_id: rider2ProfileId  },
    ]),
    'insert memberships'
  )

  // Dev-manager stub — lets the developer running /testIssue claim a real manager
  // membership in this throwaway barn via the normal invite flow (claim_managed_member
  // merges into their existing profile, per #887), so scripts/change-user.sh has a row
  // of theirs to swap into. Mirrors seed-account.ts's stub-creation, not reused directly
  // since that script is interactive/single-shot and this one seeds unattended.
  const { firstName: devFirstName, lastName: devLastName } = splitDevName(DEV_NAME!)
  const devProfile = mustSucceed<{ id: string }>(
    await supabase
      .from('profiles')
      .insert({ first_name: devFirstName, last_name: devLastName, is_managed: true })
      .select('id')
      .single(),
    'insert dev-manager stub profile'
  )
  const devInviteToken = randomUUID()
  mustSucceed(
    await supabase.from('barn_memberships').insert({
      barn_id: barnId,
      profile_id: devProfile.id,
      role: 'manager',
      status: 'active',
      can_instruct: false,
      invite_token: devInviteToken,
    }),
    'insert dev-manager stub membership'
  )

  const { data: riderMemberships, error: rmErr } = await supabase
    .from('barn_memberships').select('id, user_id').eq('barn_id', barnId).eq('role', 'rider')
  if (rmErr) throw rmErr
  const rider1MembershipId = riderMemberships!.find((m) => m.user_id === riderId)!.id
  const rider2MembershipId = riderMemberships!.find((m) => m.user_id === rider2Id)!.id

  const trainerMembers = await getActiveMembersWithProfiles(barnId, 'trainer', supabase)
  const trainerMembership = trainerMembers.find((m) => m.userId === trainerId)
  if (!trainerMembership) throw new Error('active trainer membership not found')
  const trainerMembershipId = trainerMembership.membershipId

  const tier1 = await createTier(barnId, 'Standard', 80, true, null, null, 25, supabase)
  const tier2 = await createTier(barnId, 'Premium', 120, false, null, null, 25, supabase)

  const horse1 = await createHorse(barnId, 'Apollo', undefined, supabase)
  const horse2 = await createHorse(barnId, 'Bella', undefined, supabase)

  const now = new Date()
  const past = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  const future = (daysAhead: number) =>
    new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString()
  // DATE-only columns (horse_expenses.expense_date) must land on the barn's own
  // calendar day, not UTC's — the dashboard's Day view (getScheduleForRange) compares
  // them against a barn-timezone wall-clock window (see barns.timezone in
  // docs/architecture/schema.md).
  const futureBarnLocalDate = (daysAhead: number) =>
    instantToLocalWallClock(new Date(future(daysAhead)), barn.timezone).slice(0, 10)

  await createLessonWithParticipants({
    barnId, instructorId: trainerMembershipId, lessonAt: past(5), fee: tier1.price,
    horseIds: [horse1.id], exertionLevels: [3], riderIds: [rider1MembershipId],
    lessonType: 'normal', jumping: false, tierName: tier1.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerMembershipId, lessonAt: past(3), fee: tier2.price,
    horseIds: [horse2.id], exertionLevels: [4], riderIds: [rider1MembershipId],
    lessonType: 'normal', jumping: true, tierName: tier2.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerMembershipId, lessonAt: past(1), fee: 80,
    horseIds: [horse1.id, horse2.id], exertionLevels: [3, 2], riderIds: [rider1MembershipId, rider2MembershipId],
    lessonType: 'group', jumping: false, tierName: 'Custom',
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerMembershipId, lessonAt: past(10), fee: tier1.price,
    horseIds: [horse2.id], exertionLevels: [2], riderIds: [rider1MembershipId],
    lessonType: 'normal', jumping: false, tierName: tier1.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerMembershipId, lessonAt: future(2), fee: tier1.price,
    horseIds: [horse1.id], exertionLevels: [3], riderIds: [rider1MembershipId],
    lessonType: 'normal', jumping: false, tierName: tier1.name,
  }, supabase)

  await createLessonWithParticipants({
    barnId, instructorId: trainerMembershipId, lessonAt: future(5), fee: tier2.price,
    horseIds: [horse2.id], exertionLevels: [5], riderIds: [rider1MembershipId],
    lessonType: 'normal', jumping: true, tierName: tier2.name,
  }, supabase)

  const pastLessons = mustSucceed(
    await supabase.from('lessons').select('id').eq('barn_id', barnId).lt('lesson_at', now.toISOString()),
    'fetch past lessons'
  )
  mustSucceed(
    await supabase
      .from('transactions')
      .update({ collected: true, payment_type: 'venmo' })
      .eq('barn_id', barnId)
      .in('lesson_id', pastLessons.map((l: { id: string }) => l.id))
      .in('kind', ['lesson_fee', 'instructor_payout']),
    'mark past lessons paid'
  )

  // Created after the paid-marking step above, so it starts (and stays) unpaid.
  // Enrolls rider2 only — not the 'rider' test login — so 'rider' has zero unpaid
  // lessons/charges while the manager still sees one barn-wide, giving the dashboard
  // Reminders section both a shown (manager) and hidden (rider) case to assert against.
  await createLessonWithParticipants({
    barnId, instructorId: trainerMembershipId, lessonAt: past(1), fee: tier1.price,
    horseIds: [horse2.id], exertionLevels: [3], riderIds: [rider2MembershipId],
    lessonType: 'normal', jumping: false, tierName: tier1.name,
  }, supabase)

  // Same-day lesson so the dashboard's "Today" section (split from "This Week") has
  // something to render. fee: 0 keeps it out of every outstanding-fee query
  // regardless of how much time passes between seeding and the e2e run. Pinned 15
  // minutes past seed time, not at it — getUpcomingLessons filters lesson_at >= the
  // dashboard request's own `now`, which is always later than the seed instant, so
  // an exact `now.toISOString()` lesson is already excluded by the time any test
  // hits the page.
  await createLessonWithParticipants({
    barnId, instructorId: trainerMembershipId, lessonAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(), fee: 0,
    horseIds: [horse1.id], exertionLevels: [2], riderIds: [rider1MembershipId],
    lessonType: 'normal', jumping: false, tierName: 'Custom',
  }, supabase)

  // Isolated unpaid lease charge — one_time cadence backdates the charge's period to
  // 2 months ago (a monthly agreement's first charge is always for the current month,
  // per create_agreement_with_first_charge, so it wouldn't be "outstanding" yet).
  // Enrolls rider2 only, mirroring the isolated unpaid lesson above, so the 'rider'
  // test login still has zero reminders.
  const leaseStartDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await createAgreement({
    barnId, riderId: rider2MembershipId, horseId: horse2.id, fee: 150,
    kind: 'lease', cadence: 'one_time', startDate: leaseStartDate,
  }, supabase)

  // Undated document reminder for the dashboard's Document Reminders card — the
  // e2e spec sets a past reminder_date via the horse page's UI form. No DAL
  // equivalent takes a service-role client (documents.ts's createDocument always
  // calls the SSR client), so this is a raw insert; the storage object itself is a
  // real (if dummy) upload, not just a DB row — the horse detail page's Documents
  // table signs a URL for every row it renders (getSignedUrl → createSignedUrl),
  // which errors on a path with nothing actually stored there.
  // Path shape must match documents/new/actions.ts's `${barn.id}/${folder}/${entityId}/...`
  // convention — storage RLS keys off (storage.foldername(name))[1]/[2] as barn_id/entity-type.
  const documentStoragePath = `${barnId}/horses/${horse1.id}/coggins.pdf`
  mustSucceed(
    await supabase.storage.from('documents').upload(documentStoragePath, Buffer.from('test document'), {
      contentType: 'application/pdf',
    }),
    'upload horse document file'
  )
  mustSucceed(
    await supabase.from('horse_documents').insert({
      barn_id: barnId,
      horse_id: horse1.id,
      record_type: 'coggins',
      storage_path: documentStoragePath,
      file_name: 'coggins.pdf',
      file_size: 1024,
      notes: null,
      reminder_date: null,
    }),
    'insert horse document'
  )

  // Second document, already past its reminder_date, so the dashboard's Document
  // Reminders card has content for manual walkthroughs without hand-editing a date
  // via the UI (the coggins doc above stays undated — the e2e spec exercises setting
  // its reminder date itself). Real (if tiny) PDF content, not a dummy buffer, same
  // reason as above: getSignedUrl errors on a path with nothing actually stored there.
  const pastDueDocumentPath = `${barnId}/horses/${horse2.id}/insurance.pdf`
  const pastDueDocumentContent = readFileSync(join(process.cwd(), 'scripts/data/test_1_kb.pdf'))
  mustSucceed(
    await supabase.storage.from('documents').upload(pastDueDocumentPath, pastDueDocumentContent, {
      contentType: 'application/pdf',
    }),
    'upload past-due horse document file'
  )
  mustSucceed(
    await supabase.from('horse_documents').insert({
      barn_id: barnId,
      horse_id: horse2.id,
      record_type: 'insurance_binder',
      storage_path: pastDueDocumentPath,
      file_name: 'insurance.pdf',
      file_size: pastDueDocumentContent.length,
      notes: null,
      reminder_date: past(1).slice(0, 10),
    }),
    'insert past-due horse document'
  )

  // Scheduled expense, same calendar day as the future(2) lesson above — the
  // dashboard's Barn Schedule interleaves lessons and expenses by time within a day.
  // Time is pinned to 23:00 (vs. the lesson's uncontrolled seed-time-of-day) so the
  // e2e spec can assert a deterministic "lesson card before expense card" DOM order.
  await createExpense(barnId, {
    expenseDate: futureBarnLocalDate(2),
    expenseTime: '23:00',
    recipient: 'Valley Farrier',
    expenseType: 'Farrier',
    appliesToAllHorses: false,
    horseIds: [horse1.id],
  }, supabase)

  // Date-only planned expense (no expense_time) — must NOT appear on the dashboard,
  // which only shows scheduled expenses that have a time set.
  await createExpense(barnId, {
    expenseDate: futureBarnLocalDate(4),
    recipient: 'Feed Supplier',
    expenseType: 'Feed',
    appliesToAllHorses: true,
  }, supabase)

  console.log(`Done. Test barn seeded:`)
  console.log(`  Barn:     ${barnName} (slug: ${BARN_SLUG}, id: ${barnId})`)
  console.log(`  Manager:  ${buildTestUserEmail(BARN_SLUG, 'manager')} / ${TEST_PASSWORD}`)
  console.log(`  Trainer:  ${buildTestUserEmail(BARN_SLUG, 'trainer')} / ${TEST_PASSWORD}`)
  console.log(`  Rider:    ${buildTestUserEmail(BARN_SLUG, 'rider')} / ${TEST_PASSWORD}`)
  console.log(`  Horses:   Apollo, Bella`)
  console.log(`  Tiers:    Standard ($80, default), Premium ($120)`)
  console.log(`  Lessons:  8 (5 past, 1 today, 2 future; 1 group; all but 1 marked paid)`)
  console.log(`  Expenses: 1 scheduled (Valley Farrier), 1 date-only planned (Feed Supplier)`)
  console.log(`  Lease:    1 unpaid (2 months backdated)`)
  console.log(`  Documents: 1 undated (Apollo, Coggins), 1 past-due reminder (Bella, Insurance Binder)`)
  console.log(`  Dev invite (manager, for change-user.sh): ${buildInvitePath(BARN_SLUG, devInviteToken)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('seed-test-barn failed:', err.message)
    process.exit(1)
  })
}
