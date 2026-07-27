// A clickable throwaway barn for manual walkthroughs (/testIssue), seeded from the same
// builders the e2e suite uses — one implementation, two entry points.
//
// The three e2e logins are per *project*, not per barn (see scripts/e2e-auth-users.ts), so
// this script verifies they exist rather than creating its own.

import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  createBarn,
  addMemberships,
  addTier,
  addHorse,
  addPaidLesson,
  addUnpaidLesson,
  addExpense,
  addLeaseCharge,
  addHorseDocument,
  addManagedManagerInvite,
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
  const devInviteToken = await addManagedManagerInvite(supabase, barn.id, devFirstName, devLastName)

  const tier1 = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const tier2 = await addTier(supabase, barn.id, { name: 'Premium', price: 120 })

  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  const bella = await addHorse(supabase, barn.id, 'Bella')

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

  await addPaidLesson(supabase, barn, lesson(daysFromNow(-10)))
  await addPaidLesson(supabase, barn, lesson(daysFromNow(-5)))
  await addPaidLesson(supabase, barn, lesson(daysFromNow(-3), { horseIds: [bella.id], fee: tier2.price, tierName: tier2.name, jumping: true }))
  await addPaidLesson(supabase, barn, lesson(daysFromNow(-1), {
    horseIds: [apollo.id, bella.id],
    exertionLevels: [3, 2],
    riderIds: [members.rider.membershipId, members.rider2.membershipId],
    lessonType: 'group',
  }))
  await addUnpaidLesson(supabase, barn, lesson(daysFromNow(2)))
  await addUnpaidLesson(supabase, barn, lesson(daysFromNow(5), { horseIds: [bella.id], fee: tier2.price, tierName: tier2.name, jumping: true }))

  // Same-day lesson so the dashboard's current day has content. fee: 0 keeps it out of every
  // outstanding-fee query. Pinned 15 minutes out, not at `now` — getUpcomingLessons filters
  // lesson_at >= the dashboard request's own `now`, which is always later than the seed.
  await addUnpaidLesson(supabase, barn, lesson(new Date(Date.now() + 15 * 60 * 1000), { fee: 0, tierName: 'Custom' }))

  // Unpaid lesson and lease charge on the stub rider only, so the `rider` login still has
  // zero reminders while the manager sees both barn-wide.
  await addUnpaidLesson(supabase, barn, lesson(daysFromNow(-1), { horseIds: [bella.id], riderIds: [members.rider2.membershipId] }))
  await addLeaseCharge(supabase, barn, { monthsAgo: 2, riderId: members.rider2.membershipId, horseId: bella.id, fee: 150 })

  // Undated document — the horse page's reminder-date form has something to act on.
  await addHorseDocument(supabase, barn, apollo.id, { recordType: 'coggins', fileName: 'coggins.pdf' })
  // Past-due document, from the real fixture PDF, so the Document Reminders card has content
  // for a manual walkthrough without hand-editing a date first.
  await addHorseDocument(supabase, barn, bella.id, {
    recordType: 'insurance_binder',
    fileName: 'insurance.pdf',
    reminderDate: daysFromNow(-1).toISOString().slice(0, 10),
    content: readFileSync(join(process.cwd(), 'scripts/data/test_1_kb.pdf')),
  })

  await addExpense(supabase, barn, {
    at: daysFromNow(2),
    time: '23:00',
    recipient: 'Valley Farrier',
    expenseType: 'Farrier',
    horseIds: [apollo.id],
  })
  // Date-only planned expense (no time) — must NOT appear on the dashboard.
  await addExpense(supabase, barn, { at: daysFromNow(4), recipient: 'Feed Supplier', expenseType: 'Feed' })

  console.log(`Done. Test barn seeded:`)
  console.log(`  Barn:     ${barn.name} (slug: ${barn.slug}, id: ${barn.id})`)
  for (const user of Object.values(E2E_USERS)) {
    console.log(`  ${(user.role.charAt(0).toUpperCase() + user.role.slice(1) + ':').padEnd(9)} ${user.email} / ${E2E_PASSWORD}`)
  }
  console.log(`  Horses:   Apollo, Bella`)
  console.log(`  Tiers:    Standard ($80, default), Premium ($120)`)
  console.log(`  Lessons:  9 (5 past, 1 today, 2 future; 1 group; all but 2 marked paid)`)
  console.log(`  Expenses: 1 scheduled (Valley Farrier), 1 date-only planned (Feed Supplier)`)
  console.log(`  Lease:    1 unpaid (2 months backdated)`)
  console.log(`  Documents: 1 undated (Apollo, Coggins), 1 past-due reminder (Bella, Insurance Binder)`)
  console.log(`  Dev manager invite (claim to work in this barn as yourself):`)
  console.log(`    ${buildInvitePath(barn.slug, devInviteToken)}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('seed-test-barn failed:', err.message)
    process.exit(1)
  })
}
