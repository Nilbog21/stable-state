/**
 * Dev-project reset entry point (#502's canonical split: this file holds the
 * `.sh`-validated bootstrapping, `seed-barn.ts` holds the logic): gated by
 * `assertDevProject`, it wipes the whole project via `teardownAllData`, recreates the
 * three per-project e2e auth logins (`createE2eAuthUsers` — the teardown removes them
 * along with everything else, #1085), inserts the fixed `dev-barn` row (stable UUID;
 * `created_at` backdated four months so the Finances page's earliest navigable month
 * has no seeded lessons, #971), creates the manager2 auth user, delegates every fixture
 * to `seedBarn`, and prints the seeded-state summary from the returned `SeedBarnResult`
 * plus the re-imported `DEV_*` constants.
 */
import { fileURLToPath } from 'url'
import { mustSucceed, createServiceClient, teardownAllData, assertDevProject } from './script-utils'
import { createE2eAuthUsers } from './e2e-auth-users'
import { E2E_USERS } from '../e2e/support/fixtures'
import {
  seedBarn,
  isGroupLesson,
  getPaymentType,
  DEV_TRAINERS,
  DEV_RIDERS,
  DEV_HORSES,
  DEV_RETIRED_HORSE,
  DEV_UNAVAILABLE_HORSE,
  DEV_UNAVAILABLE_REASON,
  DEV_MANAGER_2,
  DEV_TRAINER_4,
  DEV_TIER_NAME,
  DEV_TIER_PRICE,
  DEV_TIER_2_NAME,
  DEV_TIER_2_PRICE,
} from './seed-barn'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const DEV_BARN_ID = '00000000-0000-0000-0000-000000000b41'
const DEV_BARN_SLUG = 'dev-barn'
const DEV_BARN_NAME = 'Dev Barn'

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  assertDevProject(SUPABASE_URL)

  const supabase = createServiceClient(SUPABASE_URL!, SERVICE_ROLE_KEY!)

  console.log('Tearing down all data…')

  await teardownAllData(supabase)

  // The checklist e2e suite's three logins are per project, not per barn, and the teardown
  // above removes them along with everything else — so they're recreated here rather than by
  // any barn seed.
  console.log('Recreating e2e auth users…')
  await createE2eAuthUsers(supabase)

  console.log('Re-seeding dev fixtures…')

  const now = new Date()
  // #971: 4 months back (not 3) so the barn's creation month has no seeded lessons —
  // buildLessonDates only seeds the 3 months before this one — letting the Finances page's
  // earliest navigable month exercise real empty-state/unattributed-only rendering.
  const barnCreatedAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1)).toISOString()

  mustSucceed(
    await supabase.from('barns').insert({ id: DEV_BARN_ID, name: DEV_BARN_NAME, slug: DEV_BARN_SLUG, created_at: barnCreatedAt }),
    'insert barn'
  )

  const { data: m2Data, error: m2Err } = await supabase.auth.admin.createUser({
    email: DEV_MANAGER_2.email,
    email_confirm: true,
  })
  if (m2Err) throw new Error(`create manager2: ${m2Err.message}`)

  const { lessonDates, pastLessons, expenseSeeds, defaultBoardFee } = await seedBarn(supabase, DEV_BARN_ID, DEV_BARN_SLUG, m2Data.user.id, now)

  const paidCount = pastLessons.filter((_: unknown, i: number) => getPaymentType(i, true) !== null).length - 1
  const groupCount = lessonDates.filter((_, i) => isGroupLesson(i)).length
  const barnWideExpenseCount = expenseSeeds.filter((s) => s.appliesToAllHorses).length
  const plannedExpenseCount = expenseSeeds.filter((s) => s.amount === null).length

  console.log('Done. Dev database reset to known state:')
  console.log(`  Barn:     ${DEV_BARN_NAME} (slug: ${DEV_BARN_SLUG})`)
  console.log(`  e2e logins: ${Object.values(E2E_USERS).map((u) => u.email).join(', ')} (checklist suite only — no Dev Barn membership)`)
  console.log(`  Manager2: ${DEV_MANAGER_2.email} (can_instruct=true — appears in instructor dropdown)`)
  console.log(`  Trainers: ${DEV_TRAINERS.map((t) => t.email).join(', ')}`)
  console.log(`  Riders:   ${DEV_RIDERS.map((r) => r.email).join(', ')} (${DEV_RIDERS[1].firstName} has a profile photo set)`)
  console.log(`  Horses:   ${DEV_HORSES[0]}, ${DEV_HORSES[1]} (photo set), ${DEV_HORSES[2]}, plus ${DEV_RETIRED_HORSE} (retired, deactivated_at 30 days ago, 3 past lessons + 1 upcoming), plus ${DEV_UNAVAILABLE_HORSE} (unavailable: "${DEV_UNAVAILABLE_REASON}")`)
  console.log(`  Tiers:    ${DEV_TIER_NAME} ($${DEV_TIER_PRICE}, default), ${DEV_TIER_2_NAME} ($${DEV_TIER_2_PRICE})`)
  console.log(`  Lessons:  ${lessonDates.length + 8} (${groupCount} group, ${lessonDates.length - groupCount + 5} normal, plus 1 exhaustion top-up for Clover and 2 for ${DEV_RETIRED_HORSE}; 9 across prior 3 months, 12 older than 1 week, 11 within past week, 2 today, 6 next week — the +5 from #950's seed additions) — alternating tiers, jumping, exertion 1–5; ~${paidCount} of ${pastLessons.length} past lessons marked paid; 1 cancelled, 1 with a cancelled rider participation`)
  console.log(`  Agreements: 2 board ($${defaultBoardFee} each), 1 lease ($200) — Emery has 2 simultaneously-active agreements (board + lease); each with a paid charge last month and an unpaid charge this month; the board and lease agreements also have an unpaid charge from 2 months ago (past due, for Outstanding testing)`)
  console.log(`  Expenses: ${expenseSeeds.length} spanning ~80 days back to 10 days ahead (${barnWideExpenseCount} barn-wide, ${expenseSeeds.length - barnWideExpenseCount} per-horse; recurring Farrier and Veterinary recipients; ${plannedExpenseCount} planned with no amount yet, including 1 past due for Outstanding testing and 1 date-only for tomorrow)`)
  console.log(`  Seed additions (#950): 1 Custom-tier lesson; ${DEV_TRAINER_4.email} (${DEV_TRAINER_4.firstName} ${DEV_TRAINER_4.lastName}, 4th trainer) with a single $0 comped/paid lesson; 3 Morgan-instructed lessons (today, tomorrow, 10 days ago — the 10-days-ago one also carries horse/rider/private notes)`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('reset-db failed:', err.message)
    process.exit(1)
  })
}
