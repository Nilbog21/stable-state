// covers: src/app/barn/[slug]/(protected)/members/**
// covers: src/app/barn/[slug]/(protected)/agreements/**
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addLeaseCharge, addManagedMember } from './support/fixtures'
import type { Agreement } from '@/lib/db/types'

// Seed inputs paired with the expected rendering of each. The rendered form is written out
// rather than derived from src/lib/format-currency.ts's formatFee: deriving the expectation from
// the code under test makes the assertion agree with any bug in that code, which is the same
// reason the issue forbids reading expected values out of the DB.
//
// The fee matchers are regexes, not plain strings, because text matching in a locator filter is
// *containment*: the plain string '$450.00' also matches a card rendering '$450.00/month'. The
// cadence suffix is exactly the branch that can regress — the card appends '/month' only for a
// monthly agreement, and #772 replaced code that appended it unconditionally — so the lease
// matcher has to be able to say "not followed by the suffix", which containment cannot express.
const LEASE = { fee: 450, feeText: /\$450\.00(?!\/)/ }
const BOARD = { fee: 900, feeText: /\$900\.00\/month/ }
const MANAGED_BOARD = { fee: 375 }

const LEASE_HORSE = 'Kestrel'
const BOARD_HORSE = 'Juniper'
const MANAGED_HORSE = 'Sable'

/** The agreement detail page's h1 — `${label} Detail`, which differs per kind. */
const LEASE_DETAIL_HEADING = 'Lease Detail'
const BOARD_DETAIL_HEADING = 'Boarding Detail'

// A name the checklist does not already use for someone else. Deliberately *not* "Emery": the
// checklist's Emery is a claimed rider seeded in Phase 1 and switched to via change-user.sh, so
// reusing that name for an unclaimed stub would invert what the checklist means by it. The three
// e2e logins are global to the Supabase project, so an unclaimed rider has to be this barn's own
// stub, and it needs a name of its own — the "managed (unclaimed) rider's detail page shows the
// same **Active Agreements** section" line is the only line it serves and names nobody.
const MANAGED_RIDER = { firstName: 'Rowan', lastName: 'Test' }

let leaseAgreement: Agreement
let boardAgreement: Agreement
let managedAgreement: Agreement
let managedRiderId: string

const barn = withBarn('phase4-members-agreements', async ({ supabase, barn, members }) => {
  // `at`, not `monthsAgo`: fixtures.ts documents monthsAgo as the month-scoped Finances path,
  // and nothing here reads a date at all — getActiveAgreementsForRider filters on is_active, and
  // the card renders no date — so this only needs to be a valid start date.
  const seededAt = new Date()

  // Two horses with distinct names, so "each card names its horse" discriminates between the
  // cards rather than passing on a single shared name.
  const leaseHorse = await addHorse(supabase, barn.id, LEASE_HORSE)
  const boardHorse = await addHorse(supabase, barn.id, BOARD_HORSE)

  // The claimed rider login carries both agreements. addLeaseCharge creates the agreement for
  // either kind — there is no separate agreement builder, per #1137.
  leaseAgreement = await addLeaseCharge(supabase, barn, {
    at: seededAt,
    riderId: members.rider.membershipId,
    horseId: leaseHorse.id,
    fee: LEASE.fee,
    kind: 'lease',
  })
  boardAgreement = await addLeaseCharge(supabase, barn, {
    at: seededAt,
    riderId: members.rider.membershipId,
    horseId: boardHorse.id,
    fee: BOARD.fee,
    kind: 'board',
  })

  // The unclaimed rider. addManagedMember never writes user_id, so this membership is unclaimed
  // by construction — and that null user_id is exactly what keeps its profile inside
  // teardownBarnData's sweep, which filters on `user_id IS NULL` (#1282). A demotion to
  // is_managed = false wouldn't take the row out of that sweep's reach either, but this spec
  // needs no such demotion regardless.
  const managedRider = await addManagedMember(supabase, barn.id, { ...MANAGED_RIDER, role: 'rider' })
  managedRiderId = managedRider.membershipId
  const managedHorse = await addHorse(supabase, barn.id, MANAGED_HORSE)
  managedAgreement = await addLeaseCharge(supabase, barn, {
    at: seededAt,
    riderId: managedRider.membershipId,
    horseId: managedHorse.id,
    fee: MANAGED_BOARD.fee,
    kind: 'board',
  })
})

/** The <section> owning the Active Agreements h2 — the member detail page is h2-partitioned. */
function activeAgreements(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Active Agreements', exact: true }) })
}

function agreementHref(agreementId: string) {
  return `/barn/${barn.slug}/agreements/${agreementId}`
}

/** Matched by RegExp rather than Playwright's URL glob, the idiom the rest of the suite uses. */
function atAgreementPage(agreementId: string) {
  return new RegExp(`${agreementHref(agreementId)}(\\?|$)`)
}

/** A card addressed by the agreement it points at, rather than by any text it renders. */
function agreementCard(page: Page, agreement: Agreement) {
  return activeAgreements(page).locator(
    `a[href="${agreementHref(agreement.id)}?kind=${agreement.kind}"]`
  )
}

/**
 * One locator matching both of the claimed rider's cards, each bound to its own expected value
 * by its own href.
 *
 * This shape is what keeps an "each card …" checkbox at a single assertion without weakening it.
 * A section-wide toContainText would pass when one card carries both values and the other
 * carries none; these two locators match disjoint elements, so a count of 2 requires both
 * bindings to hold and either one being wrong yields 1 or 0.
 *
 * Built from .filter()/.or() rather than one CSS `:has-text()` selector list so the matchers can
 * be regexes — see the fee constants above for why containment alone is too weak.
 */
function cardsMatching(page: Page, lease: string | RegExp, board: string | RegExp) {
  return agreementCard(page, leaseAgreement)
    .filter({ hasText: lease })
    .or(agreementCard(page, boardAgreement).filter({ hasText: board }))
}

function riderPage() {
  return `/barn/${barn.slug}/members/${barn.data.members.rider.membershipId}`
}

// ---------------------------------------------------------------------------
// A rider with active agreements
// ---------------------------------------------------------------------------

test('rider_detail_shows_an_active_agreements_header @manager', async ({ page }) => {
  await page.goto(riderPage())
  await expect(page.getByRole('heading', { name: 'Active Agreements', exact: true })).toBeVisible()
})

test('rider_detail_shows_a_card_for_the_lease_agreement @manager', async ({ page }) => {
  await page.goto(riderPage())
  await expect(agreementCard(page, leaseAgreement)).toHaveCount(1)
})

test('rider_detail_shows_a_card_for_the_boarding_agreement @manager', async ({ page }) => {
  await page.goto(riderPage())
  await expect(agreementCard(page, boardAgreement)).toHaveCount(1)
})

// The kind labels are the page's own wording for the two agreement kinds, not the column values.
test('each_agreement_card_names_its_kind @manager', async ({ page }) => {
  await page.goto(riderPage())
  await expect(cardsMatching(page, 'Lease', 'Boarding')).toHaveCount(2)
})

test('each_agreement_card_names_its_horse @manager', async ({ page }) => {
  await page.goto(riderPage())
  await expect(cardsMatching(page, LEASE_HORSE, BOARD_HORSE)).toHaveCount(2)
})

test('each_agreement_card_shows_its_fee @manager', async ({ page }) => {
  await page.goto(riderPage())
  await expect(cardsMatching(page, LEASE.feeText, BOARD.feeText)).toHaveCount(2)
})

// One checkbox, one claim — "each card links to its own agreement's detail page" — so both
// navigations live in one test.
//
// URL as the navigation wait, heading as the assertion, following the same reasoning
// checklist-phase4-finances-mutations.spec.ts records for this very route: the card is selected
// *by* its href, so the URL alone is a foregone conclusion, and 'commit' resolves before render
// — a notFound() or a server error reaches this exact URL and satisfies it. `${kind} Detail` is
// rendered only by the agreement detail page and differs per kind, so it is what pins each click
// to a working page rather than merely to an address. That is also what earns this spec's
// `covers:` declaration on agreements/**. The route 404s for real when it is wrong: it is
// manager-only, which is why #772 gave the card a `linkable` prop at all.
//
// waitForURL carries no explicit timeout — navigationTimeout defaults to none, so any number
// here could only tighten the test's own budget (#1211). test.slow() is the sanctioned way to
// buy room instead (#1206), and this test needs it: four navigations, two into a route no other
// test in this file warms, so it pays the dev server's cold-compile cost under concurrent load.
test('each_agreement_card_links_to_its_agreement_detail_page @manager', async ({ page }) => {
  test.slow()
  await page.goto(riderPage())
  await agreementCard(page, leaseAgreement).click()
  await page.waitForURL(atAgreementPage(leaseAgreement.id), { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: LEASE_DETAIL_HEADING, exact: true })).toBeVisible()

  await page.goto(riderPage())
  await agreementCard(page, boardAgreement).click()
  await page.waitForURL(atAgreementPage(boardAgreement.id), { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: BOARD_DETAIL_HEADING, exact: true })).toBeVisible()
})

// ---------------------------------------------------------------------------
// A rider with no active agreements
// ---------------------------------------------------------------------------

// rider2 is seeded by addMemberships with no agreements of any kind, so this is the empty branch
// of the same section the tests above exercise. Note it is *also* an unclaimed stub
// (`is_managed: true`, null user_id — fixtures.ts's addMemberships). The section's gate is
// `targetRole === 'rider'` and nothing else, so that is irrelevant to what these two tests
// assert, but it does mean "no agreements" and "managed" are not disjoint identities here.
function noAgreementsPage() {
  return `/barn/${barn.slug}/members/${barn.data.members.rider2.membershipId}`
}

test('a_rider_with_no_active_agreements_shows_the_empty_state @manager', async ({ page }) => {
  await page.goto(noAgreementsPage())
  await expect(activeAgreements(page).getByText('No active agreements')).toBeVisible()
})

// The whole text of the empty section, pinned exactly. Deliberately not toHaveCount(0) over a
// link locator: a section that failed to render resolves that locator to nothing and satisfies
// the count for entirely the wrong reason, so the test would stay green while asserting nothing.
// Pinning the whole text instead makes an absent section a failure, and any add-boarding link —
// which would add its own label here — a failure too. Same reasoning, and the same idiom, as
// checklist-phase4-horses-detail.spec.ts's absent-card assertion.
//
// toHaveText rather than a bare innerText() read: it auto-retries, where `expect(string)` on a
// one-shot read does not, and it compares node text rather than laid-out text — so this stays
// pinned to the section's content instead of to the h2's `uppercase` class, which innerText
// would fold into the expected string and let a purely visual change break (e2e/support/read.ts
// records that exact hazard).
const EMPTY_SECTION_TEXT = 'Active AgreementsNo active agreements'

test('the_empty_active_agreements_state_carries_no_add_boarding_link @manager', async ({ page }) => {
  await page.goto(noAgreementsPage())
  await expect(activeAgreements(page)).toHaveText(EMPTY_SECTION_TEXT)
})

// ---------------------------------------------------------------------------
// A managed (unclaimed) rider
// ---------------------------------------------------------------------------

// Asserted through the agreement's own card rather than the bare heading: "the same section"
// means the section with its content, and a heading-only assertion would pass on a section that
// renders its header and nothing else.
test('a_managed_riders_detail_page_shows_the_active_agreements_section @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${managedRiderId}`)
  await expect(agreementCard(page, managedAgreement)).toHaveCount(1)
})
