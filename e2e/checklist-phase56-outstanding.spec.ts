// covers: src/app/barn/[slug]/(protected)/finances/outstanding/**
// covers: src/app/barn/[slug]/(protected)/page.tsx
//
// /barn/<slug>/finances/outstanding through the two roles that can reach it, plus the Dashboard
// Reminders cards that are their only nav path to it (neither nav carries a Finances link — that
// claim belongs to slice 1, which owns the nav link sets; the "Reminders" clause in the unpaid-
// lessons-card lines is the rationale for why these cards matter, not a second assertion).
//
// The trainer's Outstanding and Dashboard Reminders lines in
// checklists/pre-release/phase-5-trainer.md, and the rider's counterparts in phase-6-rider.md.
// #1325 filed them under the pre-#1358 monolith's line numbers and every heading below carried
// one; #1366 replaced those with the quoted fragments, which stay true across the renumberings a
// line number cannot survive. The tags themselves are what pin the mapping.
//
// A paired slice: the same file is greped by @trainer and @rider, so Playwright dispatches it
// twice and each run seeds its own barn (support/test.ts). withBarn's callback cannot see the
// project name — test.ts resolves it in beforeAll, after the callback signature is fixed — so
// "the acting member owns X" cannot be seeded conditionally. Both barns therefore get *both*
// roles' subjects, and each role's tests target their own.
//
// ## What makes "only your own" falsifiable here
//
// Every scoped claim is asserted as a COMPLETE, COUNT-PINNED set rather than as an absence, and
// the barn holds another member's outstanding item of each kind the lines name: each role's
// subject lesson is the other role's third-party lesson, there is a cancellation fee on a lesson
// the trainer does not instruct, and there is a lease belonging to the stub rider. An unscoped
// query yields a longer set and fails; a page that rendered nothing yields a shorter one and
// also fails.
//
// ## Why one test mutates, and why the order dependence is belt-and-braces
//
// The rider's "N unpaid lessons" and "N unpaid leases/boarding" card lines (#938) are
// contradictory preconditions on one query in one barn — the first needs the rider to have unpaid
// lesson fees, the second needs them to have none while still holding a cancellation fee — and a
// spec file gets exactly one barn per project. So the leases/boarding one arranges its own state:
// it collects the rider's only unpaid lesson fee before asserting. It is declared last,
// but nothing here depends on that, and that is the property worth checking rather than the
// ordering: both tests are standalone-safe under a bare --grep. The "N unpaid lessons" one never
// mutates, and the leases/boarding one
// performs its own arrange regardless of what ran before it — each Playwright job re-seeds its
// own barn in beforeAll whichever tests the grep selected — so neither can pass only by virtue
// of running in file order. Declaration order is belt-and-braces, not load-bearing.
import { test, expect, withBarn, type Page } from './support/test'
import {
  addHorse,
  addLeaseCharge,
  addTier,
  addUnpaidLesson,
  cancelLessonRider,
  daysFromNow,
} from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import { formatFee } from '@/lib/format-currency'
import type { Lesson } from '@/lib/db/types'

// Seed inputs, not builder outputs — these are what the spec puts in. Every fee is distinct, so
// a row is identifiable by its Fee cell alone wherever it carries no link (a charge row is not
// linkable for a non-manager: /agreements/[id] is manager-only, see outstanding/page.tsx).
const TRAINER_LESSON_FEE = 80
const RIDER_LESSON_FEE = 100
const TRAINER_CANCELLED_FEE = 70
const RIDER_CANCELLED_FEE = 60
const RIDER_LEASE_FEE = 150
const RIDER_BOARD_FEE = 175
const SUTTON_LEASE_FEE = 200

// TYPE_LABELS in outstanding/page.tsx. 'Lesson' is not a substring of any other label, so a
// plain equality on the Type cell isolates each kind.
const LESSON = 'Lesson'
const CANCELLATION_FEE = 'Cancellation Fee'
const LEASE = 'Lease'
const BOARDING = 'Boarding'

type Seeded = {
  trainerLesson: Lesson
  riderLesson: Lesson
  trainerCancelled: Lesson
  riderCancelled: Lesson
}

let seeded: Seeded

/**
 * Lessons are placed on distinct past days rather than at one `monthsAgo: 0` anchor: nothing on
 * either surface is month-bucketed, and distinct days keep five fixtures on one horse
 * unambiguous. daysFromNow is barn-relative and lands at barn-local noon, so every one of these
 * is unambiguously in the past for `lesson_at < now` (#1221).
 *
 * Charges go the other way and must use `monthsAgo`: getOutstandingCharges filters
 * `period < firstOfMonth(barnToday(tz))` (#1309 moved that boundary into the barn's own zone), so
 * a current-month charge never reads as outstanding however unpaid it is.
 */
const barn = withBarn('phase56-outstanding', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: TRAINER_LESSON_FEE, isDefault: true })
  const bella = await addHorse(supabase, barn.id, 'Bella')
  const comet = await addHorse(supabase, barn.id, 'Comet')

  const lesson = (fee: number, dayOffset: number, instructorId: string, riderId: string) =>
    addUnpaidLesson(supabase, barn, {
      at: daysFromNow(dayOffset, barn.timezone),
      instructorId,
      horseIds: [bella.id],
      riderIds: [riderId],
      fee,
      tierName: tier.name,
    })

  // The two subject lessons, each of which is also the *other* role's falsifier — the trainer
  // does not instruct riderLesson (the manager does), and the rider is not enrolled in
  // trainerLesson (the stub rider is). One fixture per role rather than a third "other member's"
  // lesson: a dedicated one would assert nothing the pair doesn't already.
  const trainerLesson = await lesson(TRAINER_LESSON_FEE, -1, members.trainer.membershipId, members.rider2.membershipId)
  const riderLesson = await lesson(RIDER_LESSON_FEE, -3, members.manager.membershipId, members.rider.membershipId)

  // Two late rider cancellations. sync_rider_cancellation_fee DELETEs the uncollected lesson_fee
  // row and inserts a rider_cancellation_fee keyed on lesson_rider_id, and
  // get_outstanding_transactions resolves outstanding *lessons* off lesson_fee alone — so each of
  // these contributes a Cancellation Fee row and no Lesson row. That is what lets 990's state
  // exist at all, and it is why the expected row sets below are exactly four and two entries.
  const trainerCancelled = await lesson(
    TRAINER_CANCELLED_FEE, -4, members.trainer.membershipId, members.rider2.membershipId
  )
  await cancelLessonRider(supabase, barn, {
    lessonId: trainerCancelled.id,
    riderId: members.rider2.membershipId,
    isLate: true,
  })

  // Instructed by the manager, so it is invisible to the trainer's own-instructor filter — the
  // falsifier for "uncollected cancellation fees for lessons you instruct" — while being the
  // rider's own fee for "her own uncollected late-cancellation fees".
  const riderCancelled = await lesson(
    RIDER_CANCELLED_FEE, -5, members.manager.membershipId, members.rider.membershipId
  )
  await cancelLessonRider(supabase, barn, {
    lessonId: riderCancelled.id,
    riderId: members.rider.membershipId,
    isLate: true,
  })

  // The rider's own past-due charges, one of each kind (for "her own outstanding lease/boarding
  // charges"), which also makes the leases card plural.
  await addLeaseCharge(supabase, barn, {
    monthsAgo: 2,
    riderId: members.rider.membershipId,
    horseId: comet.id,
    fee: RIDER_LEASE_FEE,
  })
  await addLeaseCharge(supabase, barn, {
    monthsAgo: 1,
    kind: 'board',
    riderId: members.rider.membershipId,
    horseId: comet.id,
    fee: RIDER_BOARD_FEE,
  })

  // The stub rider's agreement — the falsifier for "no entries for other riders' agreements".
  // Unscoped, this adds a fifth row with a second 'Lease' entry to the Type column that line is about.
  await addLeaseCharge(supabase, barn, {
    monthsAgo: 2,
    riderId: members.rider2.membershipId,
    horseId: comet.id,
    fee: SUTTON_LEASE_FEE,
  })

  seeded = { trainerLesson, riderLesson, trainerCancelled, riderCancelled }
})

// ---------------------------------------------------------------------------
// Locators and reads
// ---------------------------------------------------------------------------

function outstandingPath(): string {
  return `/barn/${barn.slug}/finances/outstanding`
}

function dashboardPath(): string {
  return `/barn/${barn.slug}`
}

function lessonHref(lessonId: string): string {
  return `/barn/${barn.slug}/lessons/${lessonId}`
}

type OutstandingRow = { type: string; fee: string; link: string | null }

/**
 * Every Outstanding Payments row as Type, Fee, and the row's link (the Date cell's, for the two
 * kinds that have one).
 *
 * evaluateAll keeps its inline waitFor rather than moving to a settled read — read.ts's rule is
 * that a helper wrapping a callback reads worse than the guard it replaces. The guard is not
 * decoration: evaluateAll is one-shot, so an unrendered table yields `[]`, and every set
 * comparison below would then pass on nothing (#1238/#1243). Both roles' tables are seeded
 * non-empty, so this is a real precondition.
 */
async function outstandingRows(page: Page): Promise<OutstandingRow[]> {
  const rows = page.locator('tbody tr')
  await rows.first().waitFor()
  return rows.evaluateAll((trs) =>
    trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'))
      return {
        type: cells[1]?.textContent?.trim() ?? '',
        fee: cells[4]?.textContent?.trim() ?? '',
        link: tr.querySelector('a')?.getAttribute('href') ?? null,
      }
    })
  )
}

/**
 * The links of the rows of one Type, sorted. Sorted rather than in DOM order because the claim
 * is membership, not order: `mergeOutstandingItems` interleaves three readers by date, so the
 * position of any one row is a function of the other two kinds' fixtures rather than of anything
 * these lines assert. #1286 has landed on this base, so the readers under this page are ordered
 * — a set comparison is right regardless, and stays right if that ordering changes again.
 */
function linksOfType(rows: OutstandingRow[], type: string): string[] {
  return rows.filter((row) => row.type === type).map((row) => row.link ?? '').sort()
}

/** The Reminders section, the one owning that h2 — the Calendar section is the page's other. */
function remindersSection(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Reminders', exact: true }) })
}

/** Every Reminders card's href. Same one-shot hazard and same guard as outstandingRows. */
async function reminderCardHrefs(page: Page): Promise<string[]> {
  const links = remindersSection(page).getByRole('link')
  await links.first().waitFor()
  return links.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
}

// ---------------------------------------------------------------------------
// Phase 5 — the trainer's Outstanding page: "`/barn/dev-barn/finances/outstanding` works and
// shows **only your own** outstanding lessons" and its cancellation-fee companion
// ---------------------------------------------------------------------------

// The page loading at all is part of that line's claim ("works"), and outstandingRows' waitFor is
// what asserts it: a 404 or an empty table fails before the comparison is reached.
test('trainer_outstanding_lists_only_the_lessons_they_instruct @trainer', async ({ page }) => {
  await page.goto(outstandingPath())
  expect(linksOfType(await outstandingRows(page), LESSON)).toEqual([lessonHref(seeded.trainerLesson.id)])
})

test('trainer_outstanding_lists_uncollected_cancellation_fees_for_lessons_they_instruct @trainer', async ({ page }) => {
  await page.goto(outstandingPath())
  expect(linksOfType(await outstandingRows(page), CANCELLATION_FEE)).toEqual([
    lessonHref(seeded.trainerCancelled.id),
  ])
})

// ---------------------------------------------------------------------------
// Phase 5 — the trainer's Dashboard Reminders card: "With unpaid lessons among the ones you
// instruct, the Dashboard shows a \"Reminders\" section"
// ---------------------------------------------------------------------------

// unpaidLessonsCount is outstandingLessons.length + outstandingCancellationFees.length (see the
// dashboard page), which for this trainer is the two rows the pair of checks above pin — so the
// count in the card is derived from the seeded set rather than written as a literal.
const TRAINER_UNPAID_LESSON_COUNT = 2

// getOutstandingCharges returns [] unconditionally for a trainer, so this is the trainer's only
// Reminders card and the exact-name match is unambiguous.
test('trainer_dashboard_reminders_carries_an_unpaid_lessons_card @trainer', async ({ page }) => {
  await page.goto(dashboardPath())
  await expect(
    remindersSection(page).getByRole('link', { name: `${TRAINER_UNPAID_LESSON_COUNT} unpaid lessons`, exact: true })
  ).toBeVisible()
})

// A real click rather than an href read: the line's claim is that this card is the trainer's nav
// path to the page, so the navigation is the thing worth exercising. waitForURL is the assertion
// — it fails the test outright if the navigation never lands — and carries no timeout, since
// navigationTimeout is already unbounded and a number could only tighten it (#1211). No hydration
// barrier: the card is a `Button href` → a Next Link → an anchor, so a click landing before React
// is listening navigates the document rather than being lost (e2e/CLAUDE.md fact 11).
test('trainer_unpaid_lessons_card_navigates_to_the_outstanding_page @trainer', async ({ page }) => {
  await page.goto(dashboardPath())
  await remindersSection(page)
    .getByRole('link', { name: `${TRAINER_UNPAID_LESSON_COUNT} unpaid lessons`, exact: true })
    .click()
  await page.waitForURL((url) => url.pathname === outstandingPath(), { waitUntil: 'commit' })
})

// ---------------------------------------------------------------------------
// Phase 6 — the rider's Outstanding page: "shows only Dana's outstanding lessons" through
// "no entries for other riders' agreements"
// ---------------------------------------------------------------------------

test('rider_outstanding_lists_only_their_own_lessons @rider', async ({ page }) => {
  await page.goto(outstandingPath())
  expect(linksOfType(await outstandingRows(page), LESSON)).toEqual([lessonHref(seeded.riderLesson.id)])
})

// Both kinds, asserted as Type-and-Fee pairs because a charge row carries no link for a
// non-manager (/agreements/[id] is manager-only). The stub rider's $200.00 lease is what makes
// this falsifiable — unscoped, a third pair appears and the comparison fails.
test('rider_outstanding_lists_their_own_past_due_lease_and_boarding_charges @rider', async ({ page }) => {
  await page.goto(outstandingPath())
  const rows = await outstandingRows(page)
  expect(
    rows
      .filter((row) => row.type === LEASE || row.type === BOARDING)
      .map((row) => `${row.type} ${row.fee}`)
      .sort()
  ).toEqual([`${BOARDING} ${formatFee(RIDER_BOARD_FEE)}`, `${LEASE} ${formatFee(RIDER_LEASE_FEE)}`].sort())
})

test('rider_outstanding_lists_their_own_uncollected_late_cancellation_fee @rider', async ({ page }) => {
  await page.goto(outstandingPath())
  expect(linksOfType(await outstandingRows(page), CANCELLATION_FEE)).toEqual([
    lessonHref(seeded.riderCancelled.id),
  ])
})

// The Type column read across *every* row, which is both halves of "That page has a Type column,
// with no entries for other riders' agreements" in one comparison:
// each row's Type cell is populated (an empty or missing cell fails), and the set is complete at
// four (the stub rider's agreement would add a second 'Lease' and fail). Stated as the whole
// table rather than as an absence so a page that rendered nothing cannot satisfy it.
test('rider_outstanding_type_column_carries_no_other_riders_agreements @rider', async ({ page }) => {
  await page.goto(outstandingPath())
  const rows = await outstandingRows(page)
  expect(rows.map((row) => row.type).sort()).toEqual([BOARDING, CANCELLATION_FEE, LEASE, LESSON].sort())
})

// ---------------------------------------------------------------------------
// Phase 6 — the rider's Dashboard Reminders cards: the "N unpaid lessons" and "N unpaid
// leases/boarding" card lines
// ---------------------------------------------------------------------------

// The same derivation as the trainer's: one outstanding lesson plus one cancellation fee, and two
// outstanding charges.
const RIDER_UNPAID_LESSON_COUNT = 2
const RIDER_UNPAID_CHARGE_COUNT = 2

test('rider_dashboard_reminders_carries_an_unpaid_lessons_card @rider', async ({ page }) => {
  await page.goto(dashboardPath())
  await expect(
    remindersSection(page).getByRole('link', { name: `${RIDER_UNPAID_LESSON_COUNT} unpaid lessons`, exact: true })
  ).toBeVisible()
})

test('rider_dashboard_reminders_carries_an_unpaid_leases_boarding_card @rider', async ({ page }) => {
  await page.goto(dashboardPath())
  await expect(
    remindersSection(page).getByRole('link', {
      name: `${RIDER_UNPAID_CHARGE_COUNT} unpaid leases/boarding`,
      exact: true,
    })
  ).toBeVisible()
})

// "Each of those cards" is one checkbox, so it is one assertion over both: the array form pins
// the count at two as well as each href, so a card that stopped rendering fails rather than
// matching nothing. Hrefs rather than two clicks — the trainer's sibling check above already
// exercises a real click on this same component.
test('rider_reminder_cards_link_to_the_outstanding_page @rider', async ({ page }) => {
  await page.goto(dashboardPath())
  expect(await reminderCardHrefs(page)).toEqual([outstandingPath(), outstandingPath()])
})

// The "N unpaid leases/boarding" card line (#938). Arranged rather than seeded, and declared
// last, for the reason in the header:
// 987 above needs this rider to have an unpaid lesson fee and this line needs them to have none,
// which one barn cannot hold at once. Collecting the rider's only unpaid lesson leaves the
// cancellation fee as the sole contributor to unpaidLessonsCount — so the card appearing at all
// is #938's claim, and the *singular* 'lesson' is the evidence the count came from the fee
// rather than from a lesson that lingered.
//
// The write mirrors addPaidLesson's, done inline because this batch may not edit
// support/fixtures.ts. Its returned rows are a precondition check, not the expected answer, and
// it throws rather than asserting: an update that matched nothing would leave the rider's unpaid
// lesson in place and the card would then read '2 unpaid lessons' — which fails the assertion
// below anyway, but says nothing about why. This test still carries exactly one assertion.
test('rider_unpaid_lessons_card_still_appears_with_only_a_cancellation_fee_outstanding @rider', async ({ page }) => {
  const { supabase, barn: seededBarn } = barn.data
  const collected = mustSucceed<{ id: string }[]>(
    await supabase
      .from('transactions')
      .update({ collected: true, payment_type: 'venmo' })
      .eq('barn_id', seededBarn.id)
      .eq('lesson_id', seeded.riderLesson.id)
      .in('kind', ['lesson_fee', 'instructor_payout'])
      .select('id'),
    'collect the rider lesson fee'
  )
  if (!collected.length) throw new Error('collecting the rider lesson fee matched no transaction rows')

  await page.goto(dashboardPath())
  await expect(remindersSection(page).getByRole('link', { name: '1 unpaid lesson', exact: true })).toBeVisible()
})
