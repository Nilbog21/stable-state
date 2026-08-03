// covers: src/app/barn/[slug]/(protected)/members/**
// covers: src/app/barn/[slug]/(protected)/agreements/**
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addLeaseCharge, addManagedMember } from './support/fixtures'
import type { Agreement } from '@/lib/db/types'

// Seed inputs paired with the exact string the page is expected to render for them. The
// rendered form is written out rather than derived from src/lib/format-currency.ts's formatFee:
// deriving the expectation from the code under test makes the assertion agree with any bug in
// that code, which is the same reason the issue forbids reading expected values out of the DB.
const LEASE = { fee: 450, feeText: '$450.00' }
// A board agreement's cadence is 'monthly', which the card renders as a "/month" suffix — so
// the two fee strings differ in shape as well as amount, and neither is a substring of the other.
const BOARD = { fee: 900, feeText: '$900.00/month' }
const MANAGED_BOARD = { fee: 375 }

const LEASE_HORSE = 'Kestrel'
const BOARD_HORSE = 'Juniper'
const MANAGED_HORSE = 'Sable'

// Named for the checklist's "Rider Emery". The three e2e logins are global to the Supabase
// project, so an unclaimed rider has to be a stub of this barn's own.
const MANAGED_RIDER = { firstName: 'Emery', lastName: 'Test' }

let leaseAgreement: Agreement
let boardAgreement: Agreement
let managedAgreement: Agreement
let managedRiderId: string

const barn = withBarn('phase4-members-agreements', async ({ supabase, barn, members }) => {
  // Two horses with distinct names, so "each card names its horse" discriminates between the
  // cards rather than passing on a single shared name.
  const leaseHorse = await addHorse(supabase, barn.id, LEASE_HORSE)
  const boardHorse = await addHorse(supabase, barn.id, BOARD_HORSE)

  // The claimed rider login carries both agreements. addLeaseCharge creates the agreement for
  // either kind — there is no separate agreement builder, per #1137.
  leaseAgreement = await addLeaseCharge(supabase, barn, {
    monthsAgo: 0,
    riderId: members.rider.membershipId,
    horseId: leaseHorse.id,
    fee: LEASE.fee,
    kind: 'lease',
  })
  boardAgreement = await addLeaseCharge(supabase, barn, {
    monthsAgo: 0,
    riderId: members.rider.membershipId,
    horseId: boardHorse.id,
    fee: BOARD.fee,
    kind: 'board',
  })

  // The unclaimed rider. addManagedMember never writes user_id, so this membership is
  // unclaimed by construction — and its profile stays is_managed = true, which is what keeps
  // it inside teardownBarnData's sweep (that sweep skips is_managed = false rows, so a stub
  // demoted to reach a claimed state would survive teardown; this spec needs no such demotion).
  const emery = await addManagedMember(supabase, barn.id, { ...MANAGED_RIDER, role: 'rider' })
  managedRiderId = emery.membershipId
  const managedHorse = await addHorse(supabase, barn.id, MANAGED_HORSE)
  managedAgreement = await addLeaseCharge(supabase, barn, {
    monthsAgo: 0,
    riderId: emery.membershipId,
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

/** A card addressed by the agreement it points at, rather than by any text it renders. */
function agreementCard(page: Page, agreementId: string) {
  return activeAgreements(page).locator(`a[href="${agreementHref(agreementId)}"]`)
}

/**
 * One locator matching both of the claimed rider's cards, each bound to its own expected value
 * by its own href.
 *
 * This shape is what keeps an "each card …" checkbox at a single assertion without weakening
 * it. A section-wide toContainText would pass when one card carries both values and the other
 * carries none; these two selectors can only ever match disjoint elements, so a count of 2
 * requires both bindings to hold and either one being wrong yields 1 or 0.
 */
function cardsMatching(page: Page, leaseText: string, boardText: string) {
  return activeAgreements(page).locator(
    `a[href="${agreementHref(leaseAgreement.id)}"]:has-text("${leaseText}"), ` +
      `a[href="${agreementHref(boardAgreement.id)}"]:has-text("${boardText}")`
  )
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
  await expect(agreementCard(page, leaseAgreement.id)).toHaveCount(1)
})

test('rider_detail_shows_a_card_for_the_boarding_agreement @manager', async ({ page }) => {
  await page.goto(riderPage())
  await expect(agreementCard(page, boardAgreement.id)).toHaveCount(1)
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
// navigations live in one test. The two assertions above already cover the hrefs; what this
// adds is that following them actually lands on that agreement's page, which no attribute
// check can show. waitForURL carries no explicit timeout: navigationTimeout defaults to none,
// so any number here could only tighten the test's own budget (#1211).
test('each_agreement_card_links_to_its_agreement_detail_page @manager', async ({ page }) => {
  await page.goto(riderPage())
  await agreementCard(page, leaseAgreement.id).click()
  await page.waitForURL(`**${agreementHref(leaseAgreement.id)}`, { waitUntil: 'commit' })

  await page.goto(riderPage())
  await agreementCard(page, boardAgreement.id).click()
  await page.waitForURL(`**${agreementHref(boardAgreement.id)}`, { waitUntil: 'commit' })
})

// ---------------------------------------------------------------------------
// A rider with no active agreements
// ---------------------------------------------------------------------------

// rider2 is seeded by addMemberships with no agreements of any kind, so this is the empty
// branch of the same section the tests above exercise.
function noAgreementsPage() {
  return `/barn/${barn.slug}/members/${barn.data.members.rider2.membershipId}`
}

test('a_rider_with_no_active_agreements_shows_the_empty_state @manager', async ({ page }) => {
  await page.goto(noAgreementsPage())
  await expect(activeAgreements(page).getByText('No active agreements')).toBeVisible()
})

// The whole rendered text of the empty section. Deliberately not toHaveCount(0) over a link
// locator: a section that failed to render resolves that locator to nothing and satisfies the
// count for entirely the wrong reason, so the test would stay green while asserting nothing.
// innerText() auto-waits on the section itself and throws when it never appears, and any
// add-boarding link would put its own label into this string.
//
// The heading reads back uppercased because innerText reflects the h2's `uppercase` class.
// Whitespace is collapsed before comparing so the assertion is pinned to the section's
// content and not to the blank line innerText emits for the heading's bottom margin — a link
// adds a word here, never just spacing, so nothing about the claim is given up.
const EMPTY_SECTION_TEXT = 'ACTIVE AGREEMENTS No active agreements'

test('the_empty_active_agreements_state_carries_no_add_boarding_link @manager', async ({ page }) => {
  await page.goto(noAgreementsPage())
  const sectionText = await activeAgreements(page).innerText()
  expect(sectionText.replace(/\s+/g, ' ').trim()).toBe(EMPTY_SECTION_TEXT)
})

// ---------------------------------------------------------------------------
// A managed (unclaimed) rider
// ---------------------------------------------------------------------------

// Asserted through the agreement's own card rather than the bare heading: "the same section"
// means the section with its content, and a heading-only assertion would pass on a section
// that renders its header and nothing else.
test('a_managed_riders_detail_page_shows_the_active_agreements_section @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${managedRiderId}`)
  await expect(agreementCard(page, managedAgreement.id)).toHaveCount(1)
})
