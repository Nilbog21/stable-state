// A clickable throwaway barn for manual walkthroughs (/testIssue), seeded from the same
// builders the e2e suite uses — one implementation, two entry points.
//
// The three e2e logins are per *project*, not per barn (see scripts/e2e-auth-users.ts), so
// this script verifies they exist rather than creating its own.

import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import {
  createBarn,
  addMemberships,
  addTier,
  addHorse,
  addPaidLesson,
  addUnpaidLesson,
  addExpense,
  addLeaseCharge,
  addBarnEvent,
  addHorseDocument,
  addRiderDocument,
  addStaffDocument,
  addNotification,
  addManagedMember,
  cancelLesson,
  cancelLessonRider,
  setHorsePhoto,
  setMemberPhoto,
  updateBarnSettings,
  assetPath,
  daysFromNow,
  E2E_USERS,
  E2E_PASSWORD,
} from '../e2e/support/fixtures'
import { verifyE2eAuthUsers, formatMissingUsersError } from './e2e-auth-users'
import { teardown } from './teardown-test-barn'
import { buildInvitePath } from './seed-account'
import { createServiceClient, assertDevProject } from './script-utils'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BARN_SLUG = process.env.TEST_BARN_SLUG
const DEV_NAME = process.env.DEV_NAME

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

  const missing = await verifyE2eAuthUsers(supabase)
  if (missing.length > 0) throw new Error(formatMissingUsersError(missing))

  console.log(`Tearing down existing barn: ${BARN_SLUG}…`)
  await teardown(BARN_SLUG, supabase)

  console.log(`Seeding test barn: ${BARN_SLUG}…`)
  const barn = await createBarn(supabase, BARN_SLUG)
  const members = await addMemberships(supabase, barn.id)

  // Dev-manager stub — lets the developer running /testIssue claim a real manager
  // membership in this throwaway barn via the normal invite flow (claim_managed_member
  // merges into their existing profile, per #887).
  const { firstName: devFirstName, lastName: devLastName } = splitDevName(DEV_NAME!)
  const { inviteToken: devInviteToken } = await addManagedMember(supabase, barn.id, {
    firstName: devFirstName,
    lastName: devLastName,
    role: 'manager',
  })

  // Managed rider stub — the unclaimed-member pages, and the member-photo flows.
  await addManagedMember(supabase, barn.id, { firstName: 'Harper', lastName: 'Test', role: 'rider' })

  const tier1 = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const tier2 = await addTier(supabase, barn.id, { name: 'Premium', price: 120 })

  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  const bella = await addHorse(supabase, barn.id, 'Bella', {
    registeredName: "Bella's Registered Name",
    owningMemberId: members.rider.membershipId,
    exhaustionThresholdModerate: 4,
    exhaustionThresholdHigh: 8,
    feedNotes: '2 flakes hay AM/PM, half scoop grain.',
    medicationNotes: 'Daily joint supplement with breakfast.',
  })
  // Out of rotation — the inactive-horse "Needs Attention" path.
  await addHorse(supabase, barn.id, 'Comet', { isAvailable: false, unavailabilityReason: 'Recovering from an abscess' })

  type LessonOverrides = {
    horseIds?: string[]
    riderIds?: string[]
    exertionLevels?: number[]
    fee?: number
    tierName?: string
    lessonType?: 'normal' | 'group'
    jumping?: boolean
  }
  const lesson = (at: Date, opts: LessonOverrides = {}) => ({
    at,
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: tier1.price,
    tierName: tier1.name,
    ...opts,
  })

  await addPaidLesson(supabase, barn, lesson(daysFromNow(-10, barn.timezone)))
  await addPaidLesson(supabase, barn, lesson(daysFromNow(-5, barn.timezone)))
  await addPaidLesson(supabase, barn, lesson(daysFromNow(-3, barn.timezone), { horseIds: [bella.id], fee: tier2.price, tierName: tier2.name, jumping: true }))
  await addPaidLesson(supabase, barn, lesson(daysFromNow(-1, barn.timezone), {
    horseIds: [apollo.id, bella.id],
    exertionLevels: [3, 2],
    riderIds: [members.rider.membershipId, members.rider2.membershipId],
    lessonType: 'group',
  }))
  await addUnpaidLesson(supabase, barn, lesson(daysFromNow(2, barn.timezone)))
  await addUnpaidLesson(supabase, barn, lesson(daysFromNow(5, barn.timezone), { horseIds: [bella.id], fee: tier2.price, tierName: tier2.name, jumping: true }))

  // Same-day lesson so the dashboard's current day has content. fee: 0 keeps it out of every
  // outstanding-fee query (and out of the Unpaid badge, which requires fee > 0). Pinned 15
  // minutes out, not at `now`, so the lesson is still upcoming when a walkthrough's requests
  // run: the dashboard itself no longer filters by `now` (#1015 deleted getUpcomingLessons;
  // the Day view fetches the whole barn day), but the horse page's Upcoming Lessons read
  // (getUpcomingLessonsForHorse) still filters `lesson_at >= now()`, and a lesson seeded at
  // `now` would be born already-past.
  await addUnpaidLesson(supabase, barn, lesson(new Date(Date.now() + 15 * 60 * 1000), { fee: 0, tierName: 'Custom' }))

  // Unpaid lesson and lease charge on the stub rider only, so the `rider` login still has
  // zero reminders while the manager sees both barn-wide.
  await addUnpaidLesson(supabase, barn, lesson(daysFromNow(-1, barn.timezone), { horseIds: [bella.id], riderIds: [members.rider2.membershipId] }))
  await addLeaseCharge(supabase, barn, { monthsAgo: 2, riderId: members.rider2.membershipId, horseId: bella.id, fee: 150 })

  // Already-cancelled state, so the Cancelled badge and the cancellation-notes display have
  // something to show without driving the cancel flow first.
  const cancelled = await addUnpaidLesson(supabase, barn, lesson(daysFromNow(3, barn.timezone)))
  await cancelLesson(supabase, barn, { lessonId: cancelled.id, notes: 'Arena flooded.' })

  // A group lesson with one rider already cancelled — the per-rider cancel display, and the
  // group flows that need a lesson still active with a cancelled participant on it.
  const groupLesson = await addUnpaidLesson(supabase, barn, lesson(daysFromNow(4, barn.timezone), {
    horseIds: [apollo.id, bella.id],
    exertionLevels: [3, 2],
    riderIds: [members.rider.membershipId, members.rider2.membershipId],
    lessonType: 'group',
  }))
  await cancelLessonRider(supabase, barn, {
    lessonId: groupLesson.id,
    riderId: members.rider2.membershipId,
    notes: 'Away that week.',
  })

  // Barn event — Manage Barn's Barn Events list, and the dashboard calendar's interleaving.
  await addBarnEvent(supabase, barn, { at: daysFromNow(6, barn.timezone), title: 'Spring Schooling Show', notes: 'Entries close Friday.' })

  // Pre-set photos, so the read-only and replace/remove flows start from real state. Clover
  // and Harper's own assets are left unused here on purpose — they're the upload sources.
  await setHorsePhoto(supabase, barn, apollo.id, 'butter-photo.jpg')
  await setMemberPhoto(supabase, barn, members.trainer.profileId, 'emery-photo.jpg')

  await addNotification(supabase, {
    userId: members.manager.userId!,
    barnId: barn.id,
    type: 'lesson_cancelled',
    title: 'A lesson was cancelled',
    body: 'Arena flooded.',
    link: `/barn/${barn.slug}/lessons`,
  })

  // Undated document — the horse page's reminder-date form has something to act on.
  await addHorseDocument(supabase, barn, apollo.id, { recordType: 'coggins', fileName: 'coggins.pdf' })
  // Past-due document, from the real fixture PDF, so the Document Reminders card has content
  // for a manual walkthrough without hand-editing a date first.
  await addHorseDocument(supabase, barn, bella.id, {
    recordType: 'insurance_binder',
    fileName: 'insurance.pdf',
    reminderDate: daysFromNow(-1, barn.timezone).toISOString().slice(0, 10),
    content: readFileSync(assetPath('test_1_kb.pdf')),
  })
  // Members' own Documents sections.
  await addStaffDocument(supabase, barn, members.trainer, { recordType: 'instructor_contract', fileName: 'contract.pdf' })
  await addRiderDocument(supabase, barn, members.rider, { recordType: 'liability_waiver', fileName: 'waiver.pdf' })

  await addExpense(supabase, barn, {
    at: daysFromNow(2, barn.timezone),
    time: '23:00',
    recipient: 'Valley Farrier',
    expenseType: 'Farrier',
    horseIds: [apollo.id],
  })
  // Date-only planned expense (no time) — must NOT appear on the dashboard.
  await addExpense(supabase, barn, { at: daysFromNow(4, barn.timezone), recipient: 'Feed Supplier', expenseType: 'Feed' })

  // Non-default settings, so Manage Barn's fields aren't all showing the schema defaults.
  await updateBarnSettings(supabase, barn.id, {
    defaultInstructorCut: 30,
    defaultBoardFee: 900,
    exhaustionThresholdModerate: 6,
    exhaustionThresholdHigh: 12,
    scheduleBufferMinutes: 45,
  })

  console.log(`Done. Test barn seeded:`)
  console.log(`  Barn:     ${barn.name} (slug: ${barn.slug}, id: ${barn.id})`)
  for (const user of Object.values(E2E_USERS)) {
    console.log(`  ${(user.role.charAt(0).toUpperCase() + user.role.slice(1) + ':').padEnd(9)} ${user.email} / ${E2E_PASSWORD}`)
  }
  console.log(`  Horses:   Apollo (photo), Bella (owned by rider, notes, thresholds), Comet (unavailable)`)
  console.log(`  Members:  Harper Test (managed rider, unclaimed), trainer has a profile photo`)
  console.log(`  Tiers:    Standard ($80, default), Premium ($120)`)
  console.log(`  Lessons:  10 (5 past, 1 today, 4 future; 2 group; 4 marked paid; 1 cancelled; 1 with a cancelled rider)`)
  console.log(`  Events:   1 upcoming (Spring Schooling Show)`)
  console.log(`  Expenses: 1 scheduled (Valley Farrier), 1 date-only planned (Feed Supplier)`)
  console.log(`  Lease:    1 unpaid (2 months backdated)`)
  console.log(`  Documents: 1 undated (Apollo, Coggins), 1 past-due reminder (Bella, Insurance Binder), 1 staff, 1 rider`)
  console.log(`  Notifications: 1 unread for the manager login`)
  console.log(`  Dev manager invite (claim to work in this barn as yourself):`)
  console.log(`    ${buildInvitePath(barn.slug, devInviteToken)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('seed-test-barn failed:', err.message)
    process.exit(1)
  })
}
