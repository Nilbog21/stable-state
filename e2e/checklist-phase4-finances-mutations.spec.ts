import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addLeaseCharge, addPaidLesson, addTier, monthAnchor } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import { formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import type { Agreement, Horse, LessonTier } from '@/lib/db/types'

// The three most state-heavy Finances scenarios, each of which mutates barn-wide state:
// a comped lesson, a lease charge collected through the agreement page, and a trainer
// removed out from under a paid lesson they instructed. Safe only because this file owns
// its own barn — see support/test.ts.
//
// Every block is `test.describe.serial` and every block's first test captures its own
// pre-mutation baselines off the page, so no test knows an absolute figure it didn't read.
// The blocks themselves are ordered: the trainer removal is destructive and runs last.

// Not 25, which is barns.default_instructor_cut. create_lesson_with_participants falls back
// to that default whenever the tier name fails to resolve, so a value distinct from it makes
// a tier-name typo fail loudly instead of silently producing the right number anyway.
const STANDARD_CUT = 30
// Deliberately unequal to STANDARD_CUT too: the comped lesson's whole signature is that its
// tier's own cut lands with no fee to offset it, and equal cuts would let a test pass
// against the wrong tier's number.
const COMPED_CUT = 40
const COMPED_FEE = 0
const APPLE_LESSON_FEE = 100
const BIRCH_LESSON_FEE = 90
const LEASE_FEE = 150

const STANDARD_TIER = 'Standard'
const COMPED_TIER = 'Comped'

// resolveMemberNames renders each login's profile. `Test Rider` is matched exactly so it
// can't also match the managed stub `Test Rider2`.
const MANAGER_NAME = 'Test Manager'
const TRAINER_NAME = 'Test Trainer'
const RIDER_NAME = 'Test Rider'

// The clause of ByInstructorTable's Unattributed InfoPopover text that this slice's
// checkbox is about — the other clauses are other tabs' / other slices' concerns.
const REMOVED_INSTRUCTOR_EXPLANATION = 'an instructor payout whose instructor was removed from the barn'

// Column positions, uniform across every breakdown tab: label, Gross, Expenses, Net.
const GROSS_COL = 1
const NET_COL = 3

// The four tabs with a Net column. By Paid To is deliberately absent: it renders "—" for
// both Gross and Net (a recipient has no revenue concept), which is its own slice's claim.
const NET_TABS = ['horse', 'tier', 'rider', 'trainer'] as const

// Footer row labels, anchored: Playwright's `hasText` string form is case-insensitive
// substring matching, under which "Total" also matches "Subtotal".
const UNATTRIBUTED_ROW = /^Unattributed/
const OUTSIDE_ROW = /^Outside this view/
const TOTAL_ROW = /^Total/

type Seeded = {
  compedTier: LessonTier
  apple: Horse
  comet: Horse
  lease: Agreement
}

let seeded: Seeded

const barn = withBarn('phase4-finances-mutations', async ({ supabase, barn, members }) => {
  // resolveFinancesMonth clamps a requested month *up* to the barn's own creation month, and
  // withBarn creates this barn now. MONTH below is fixed at import while this runs in
  // beforeAll, so a UTC month rollover in between would leave the barn a month ahead of
  // MONTH, clamping it away and reading every table below as empty. Backdating removes the
  // ordering dependency outright. (Both are UTC-framed since #1151, so there is no longer a
  // standing skew between them for this to paper over.)
  mustSucceed(
    await supabase.from('barns').update({ created_at: monthAnchor(1).toISOString() }).eq('id', barn.id),
    'backdate barn created_at'
  )

  await addTier(supabase, barn.id, {
    name: STANDARD_TIER,
    price: APPLE_LESSON_FEE,
    isDefault: true,
    instructorCut: STANDARD_CUT,
  })
  // Priced at zero to match what it's for. Only its instructor_cut matters: a lesson's cut
  // is snapshotted from its tier at booking (create_lesson_with_participants), never from
  // its fee, which is exactly why a comped lesson can cost the barn money.
  const compedTier = await addTier(supabase, barn.id, {
    name: COMPED_TIER,
    price: 0,
    instructorCut: COMPED_CUT,
  })

  const apple = await addHorse(supabase, barn.id, 'Apple')
  const birch = await addHorse(supabase, barn.id, 'Birch')
  const comet = await addHorse(supabase, barn.id, 'Comet')

  const thisMonth = monthAnchor(0)

  // Apple's lesson is instructed by the *manager*, not the trainer — the trainer's only
  // lesson is Birch's below, so the removal block's Unattributed delta has exactly one
  // lesson behind it. It also gives Apple a By Horse row and the rider a By Rider row for
  // the lease block to take deltas against; a horse or rider with no prior activity has no
  // row at all, and there'd be nothing to read a baseline from.
  await addPaidLesson(supabase, barn, {
    at: thisMonth,
    instructorId: members.manager.membershipId,
    tierName: STANDARD_TIER,
    fee: APPLE_LESSON_FEE,
    horseIds: [apple.id],
    riderIds: [members.rider.membershipId],
  })

  // The removal block's lesson: the barn's only trainer-instructed one.
  await addPaidLesson(supabase, barn, {
    at: thisMonth,
    instructorId: members.trainer.membershipId,
    tierName: STANDARD_TIER,
    fee: BIRCH_LESSON_FEE,
    horseIds: [birch.id],
    riderIds: [members.rider2.membershipId],
  })

  // Seeded unpaid: collecting it is the mutation the lease block observes, and it does so
  // through the agreement page's own Payment Type control rather than the ledger.
  const lease = await addLeaseCharge(supabase, barn, {
    at: thisMonth,
    riderId: members.rider.membershipId,
    horseId: apple.id,
    fee: LEASE_FEE,
  })

  seeded = { compedTier, apple, comet, lease }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The month every fixture above lands in, derived from the same anchor the builders use
 * rather than from `new Date()`. finances/page.tsx resolves its default month from the server
 * clock, so a spec must always pass `?month=` — and deriving the two independently would let
 * them name different months if a UTC month rolled over between the two calls. Both sides are
 * UTC-framed (#1151), so the anchor and formatMonthParam agree by construction; see the
 * seed's note above for the ordering window the barn backdate closes.
 */
const MONTH = formatMonthParam(monthAnchor(0))

type Tab = (typeof NET_TABS)[number]

// Required, not optional: every caller names a tab, and a defaulted one would silently
// assert against whichever tab the page happens to open on.
function financesUrl(tab: Tab): string {
  return `/barn/${barn.slug}/finances?month=${MONTH}&tab=${tab}`
}

function horseDrilldownUrl(horseId: string): string {
  return `/barn/${barn.slug}/finances/horses/${horseId}?month=${MONTH}`
}

/**
 * The active tab's breakdown table. Scoped to a direct `main > div` child so it can't also
 * match the Outstanding Income table, which has a thead of its own but sits deeper, inside
 * its own `<section>`.
 */
function breakdownTable(page: Page): Locator {
  return page.locator('main > div > table')
}

function footerRow(page: Page, label: RegExp): Locator {
  return breakdownTable(page).locator('tfoot tr').filter({ hasText: label })
}

/**
 * A breakdown body row, identified by a cell holding `label`. `filter({ has })` matches any
 * cell in the row, not specifically the first one — which is safe here only because every
 * other cell on these tables is a currency figure or a dash, none of which can collide with
 * an entity name.
 */
function bodyRow(page: Page, label: string): Locator {
  return breakdownTable(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: label, exact: true }) })
}

/** Accounting notation: formatCurrency renders a negative as parens, never a leading minus. */
function parseMoney(text: string): number {
  if (text.trim() === '—') return 0
  const magnitude = Number(text.replace(/[^0-9.]/g, ''))
  return text.includes('(') ? -magnitude : magnitude
}

async function cellMoney(row: Locator, index: number): Promise<number> {
  return parseMoney((await row.locator('td').nth(index).innerText()).trim())
}

/** The horse drill-down's combined table: Date, Type, Amount, Horses, Split. */
const DRILLDOWN_AMOUNT_COL = 2

function leaseDrilldownRow(page: Page): Locator {
  return page.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'Lease', exact: true }) })
}

/** Each tab's footer Total row, Net column, in NET_TABS order. */
async function totalNetPerTab(page: Page): Promise<number[]> {
  const totals: number[] = []
  for (const tab of NET_TABS) {
    await page.goto(financesUrl(tab))
    totals.push(await cellMoney(footerRow(page, TOTAL_ROW), NET_COL))
  }
  return totals
}

// ---------------------------------------------------------------------------
// A comped ($0) lesson
// ---------------------------------------------------------------------------

/**
 * Serial because all three steps describe one mutation — the comped lesson step 1 books —
 * and steps 2 and 3 read figures that only exist once it has been booked.
 *
 * On "mark it paid": a zero-fee lesson is collected the moment it's booked, not in a later
 * step. sync_lesson_transactions sets `v_collected := (p_fee = 0) OR (p_payment_type IS NOT
 * NULL)`, so a comped lesson never reaches Outstanding Income and there is nothing to mark.
 * addPaidLesson still stamps a payment type on it, which is the act the checklist names;
 * the observable event either way is the booking, which is what the deltas below straddle.
 */
test.describe.serial('booking a comped lesson', () => {
  let baselineTotalNets: number[]

  test('comped_lesson_tier_row_net_is_negative @manager', async ({ page }) => {
    baselineTotalNets = await totalNetPerTab(page)

    await addPaidLesson(barn.data.supabase, barn.data.barn, {
      at: monthAnchor(0),
      instructorId: barn.data.members.manager.membershipId,
      tierName: COMPED_TIER,
      fee: COMPED_FEE,
      horseIds: [seeded.comet.id],
      riderIds: [barn.data.members.rider2.membershipId],
    })

    // The Comped tier's own row, whose only lesson this is: its Gross is the $0 fee and
    // its Expenses is the snapshotted cut, leaving a Net that can only be negative.
    await page.goto(financesUrl('tier'))
    expect(await cellMoney(bodyRow(page, COMPED_TIER), NET_COL)).toBeLessThan(0)
  })

  // Its own checkbox rather than a clause on the one above: the value being negative and
  // the notation it's rendered in are separate regressions. formatCurrency's accounting
  // sign means the expected string carries parens and no minus at all, so asserting the
  // exact rendering covers both halves of the claim at once.
  test('comped_lesson_tier_row_net_renders_in_parentheses @manager', async ({ page }) => {
    await page.goto(financesUrl('tier'))
    // Matched against a pattern, not against formatCurrency's own output. The claim here is
    // about which notation formatCurrency picks for a negative, so deriving the expected
    // string from that same function would move expected and actual together through
    // exactly the regression this checkbox exists to catch. The leading `^\(` is what rules
    // out a minus sign; the magnitude is the previous test's and the next one's business.
    await expect(bodyRow(page, COMPED_TIER).locator('td').nth(NET_COL)).toHaveText(
      /^\(\$[\d,]+\.\d{2}\)$/
    )
  })

  /**
   * Net, not Gross: the lesson's fee *is* zero, so its Gross contribution is $0 on every
   * tab and no Gross assertion could tell inclusion from omission. Its cut, however, lands
   * in every tab's barn-wide Expenses total, so each tab's Total Net drops by exactly the
   * cut — which is precisely "not dropped, and not clamped to zero".
   *
   * Worth knowing about the "every tab" part: finances/page.tsx derives one barn-wide
   * totalGross/totalExpenses and hands the same `total` to every tab's
   * buildReconciliationColumn, so the four Total Net figures are equal by construction, not
   * by coincidence. Reading all four therefore re-reads one number four times rather than
   * cross-checking four independent computations — that identity is the #971 reconciliation
   * check's own claim, and a separate checkbox. What this test does establish is that the
   * comped lesson reaches that shared total at its full cut.
   */
  test('comped_lesson_reduces_every_tabs_total_net_by_its_instructor_cut @manager', async ({ page }) => {
    expect(await totalNetPerTab(page)).toEqual(
      baselineTotalNets.map((net) => net - seeded.compedTier.instructor_cut)
    )
  })
})

// ---------------------------------------------------------------------------
// A lease charge collected through the agreement page
// ---------------------------------------------------------------------------

/** Sets the charge's Payment Type on its own agreement page, as the checklist step does. */
async function collectLeaseCharge(page: Page): Promise<void> {
  await page.goto(`/barn/${barn.slug}/agreements/${seeded.lease.id}?kind=lease`)
  // `.first()` is unambiguous here: a one_time lease agreement carries exactly one charge.
  const chargeRow = page.locator('main table tbody tr').first()
  await chargeRow.getByRole('combobox').selectOption('venmo')
  // A wait, not an assertion: SavedIndicator renders only once the server action has
  // resolved, so the Finances reads below can't sample the pre-collection state.
  await chargeRow.getByText('✓ Saved').waitFor()
}

test.describe.serial('collecting a lease charge', () => {
  let baselineTierOutside: number
  let baselineInstructorOutside: number
  let baselineHorseGross: number
  let baselineRiderGross: number

  test('paid_lease_charge_raises_by_tier_outside_this_view_gross @manager', async ({ page }) => {
    await page.goto(financesUrl('tier'))
    baselineTierOutside = await cellMoney(footerRow(page, OUTSIDE_ROW), GROSS_COL)
    await page.goto(financesUrl('trainer'))
    baselineInstructorOutside = await cellMoney(footerRow(page, OUTSIDE_ROW), GROSS_COL)
    await page.goto(financesUrl('horse'))
    baselineHorseGross = await cellMoney(bodyRow(page, seeded.apple.name), GROSS_COL)
    await page.goto(financesUrl('rider'))
    baselineRiderGross = await cellMoney(bodyRow(page, RIDER_NAME), GROSS_COL)

    await collectLeaseCharge(page)

    // A charge has no tier, so it can only reach this table through the derived
    // "Outside this view" bucket (total − subtotal − unattributed).
    await page.goto(financesUrl('tier'))
    expect(await cellMoney(footerRow(page, OUTSIDE_ROW), GROSS_COL)).toBe(baselineTierOutside + seeded.lease.fee)
  })

  test('paid_lease_charge_raises_by_instructor_outside_this_view_gross @manager', async ({ page }) => {
    await page.goto(financesUrl('trainer'))
    expect(await cellMoney(footerRow(page, OUTSIDE_ROW), GROSS_COL)).toBe(
      baselineInstructorOutside + seeded.lease.fee
    )
  })

  // Horse-tied, so unlike the two above it lands in the horse's own row — and unsplit:
  // getEntityIncomeSummary folds a charge in at its full fee, not divided by anything.
  test('paid_lease_charge_raises_the_leased_horses_by_horse_gross @manager', async ({ page }) => {
    await page.goto(financesUrl('horse'))
    expect(await cellMoney(bodyRow(page, seeded.apple.name), GROSS_COL)).toBe(baselineHorseGross + seeded.lease.fee)
  })

  test('horse_drilldown_shows_the_paid_charge_as_a_row @manager', async ({ page }) => {
    await page.goto(horseDrilldownUrl(seeded.apple.id))
    await expect(leaseDrilldownRow(page).locator('td').nth(DRILLDOWN_AMOUNT_COL)).toHaveText(
      formatCurrency(seeded.lease.fee)
    )
  })

  // Split from the checkbox above: the row rendering and the row linking somewhere useful
  // are independently regressable.
  //
  // URL first as the navigation wait, heading second as the sole assertion — the inverse of
  // the obvious order, and deliberate. The href is built from the charge row's own
  // agreementId, so a *wrong* id lands on a different URL and the URL match catches it;
  // a *right* id whose record no longer resolves reaches this very URL and renders a 404,
  // which only the heading catches. The URL pins which agreement, the heading pins working.
  test('horse_drilldown_charge_row_links_back_to_its_agreement @manager', async ({ page }) => {
    await page.goto(horseDrilldownUrl(seeded.apple.id))
    await leaseDrilldownRow(page).getByRole('link').click()
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/agreements/${seeded.lease.id}\\?kind=lease$`))
    await expect(page.getByRole('heading', { name: 'Lease Detail' })).toBeVisible()
  })

  test('paid_lease_charge_raises_the_leasing_riders_by_rider_gross @manager', async ({ page }) => {
    await page.goto(financesUrl('rider'))
    expect(await cellMoney(bodyRow(page, RIDER_NAME), GROSS_COL)).toBe(baselineRiderGross + seeded.lease.fee)
  })
})

// ---------------------------------------------------------------------------
// Removing a trainer who has instructed a paid lesson
// ---------------------------------------------------------------------------

/**
 * Last in the file, and destructive: removeMemberAction hard-deletes the barn_memberships
 * row. The lesson and its ledger rows survive it — transactions.membership_id and
 * lessons.instructor_id are both ON DELETE SET NULL — which is the whole point of the
 * checkboxes below.
 */
test.describe.serial('removing a trainer who has instructed a paid lesson', () => {
  let baselineUnattributedGross: number
  let removedTrainerGross: number

  test('removing_a_trainer_redirects_to_the_members_list @manager', async ({ page }) => {
    // Read before the removal, off the page: the expected Unattributed figure below is
    // this trainer's own Gross, so nothing here needs to know the seeded fee.
    await page.goto(financesUrl('trainer'))
    baselineUnattributedGross = await cellMoney(footerRow(page, UNATTRIBUTED_ROW), GROSS_COL)
    removedTrainerGross = await cellMoney(bodyRow(page, TRAINER_NAME), GROSS_COL)

    page.on('dialog', (dialog) => dialog.accept())
    await page.goto(`/barn/${barn.slug}/members/${barn.data.members.trainer.membershipId}`)
    // Scoped to the page header rather than taken barn-wide. The Photo section can render a
    // second "Remove" — but not in this scenario: canEditPhoto gates it on the page being
    // your own or the target profile being a managed stub, and this trainer is a claimed,
    // non-managed login, so it could never appear here however many photos it had. Scoped
    // anyway, so the locator doesn't quietly depend on that gating staying where it is.
    await page
      .locator('main > div')
      .filter({ has: page.getByRole('heading', { level: 1 }) })
      .getByRole('button', { name: 'Remove' })
      .click()

    await page.waitForURL(new RegExp(`/barn/${barn.slug}/members$`), { waitUntil: 'commit' })
  })

  // The whole remaining roster, not `toHaveCount(0)` on the removed one: a bare absence
  // check also passes when the page errors, redirects, or changes its link shape, none of
  // which mean the trainer was removed. Membership ids rather than names, so a member who
  // happens to share a first or last name can't stand in for the removed one.
  test('removed_trainer_no_longer_appears_on_the_members_list @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/members`)
    const { manager, rider, rider2 } = barn.data.members
    const memberHrefs = await page
      .locator(`a[href^="/barn/${barn.slug}/members/"]`)
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    // Deduplicated: the page links your own membership twice, once from the "you" card and
    // once from the managers list.
    expect([...new Set(memberHrefs)].sort()).toEqual(
      [manager, rider, rider2].map((m) => `/barn/${barn.slug}/members/${m.membershipId}`).sort()
    )
  })

  test('removed_instructors_lesson_fee_folds_into_by_instructor_unattributed @manager', async ({ page }) => {
    await page.goto(financesUrl('trainer'))
    expect(await cellMoney(footerRow(page, UNATTRIBUTED_ROW), GROSS_COL)).toBe(
      baselineUnattributedGross + removedTrainerGross
    )
  })

  // finances/page.tsx filters the synthetic "No instructor" row out of the body and folds it
  // into the footer instead, so that row reappearing would mean the fee had been counted
  // twice over — once in the body and once in Unattributed.
  //
  // Asserted as the exact remaining roster rather than as the absence of "No instructor":
  // an absence check passes just as well when the table renders nothing at all, which is
  // what an EmptyState, a 500, or a wrong-month URL would each produce. The manager is the
  // only instructor left, having taught Apple's lesson and the comped one.
  test('by_instructor_has_no_no_instructor_body_row_after_the_removal @manager', async ({ page }) => {
    await page.goto(financesUrl('trainer'))
    const names = await breakdownTable(page).locator('tbody tr td:first-child').allInnerTexts()
    expect(names.map((name) => name.trim())).toEqual([MANAGER_NAME])
  })

  // Unlike the three above, this asserts nothing downstream of the removal:
  // unattributedInfoText is a static prop on ByInstructorTable and renders whenever the tab
  // has any activity at all, so this would pass byte-for-byte before the removal too. It
  // sits here to keep the file in checklist order, and its claim is about the copy covering
  // a removed instructor — the fold itself is the previous test's business.
  test('by_instructor_unattributed_info_icon_explains_a_removed_instructor @manager', async ({ page }) => {
    await page.goto(financesUrl('trainer'))
    await footerRow(page, UNATTRIBUTED_ROW).getByRole('button', { name: 'Info' }).click()
    await expect(page.getByText(REMOVED_INSTRUCTOR_EXPLANATION)).toBeVisible()
  })
})
