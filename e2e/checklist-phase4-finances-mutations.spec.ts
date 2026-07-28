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

const STANDARD_CUT = 25
// Deliberately unequal to STANDARD_CUT: the comped lesson's whole signature is that its
// tier's own cut lands with no fee to offset it, and equal cuts would let a test pass
// against the wrong tier's number.
const COMPED_CUT = 40
const COMPED_FEE = 0
const APPLE_LESSON_FEE = 100
const BIRCH_LESSON_FEE = 90
const LEASE_FEE = 150

const STANDARD_TIER = 'Standard'
const COMPED_TIER = 'Comped'

// lesson-finances.ts's NO_INSTRUCTOR_LABEL, copied rather than imported: that module pulls
// in the request-scoped Supabase client (and with it next/headers), which a Playwright spec
// can't load. The assertion below is that this string is *absent* from the table.
const NO_INSTRUCTOR_LABEL = 'No instructor'

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
  birch: Horse
  comet: Horse
  lease: Agreement
}

let seeded: Seeded

const barn = withBarn('phase4-finances-mutations', async ({ supabase, barn, members }) => {
  // resolveFinancesMonth clamps any requested month up to the barn's own creation month,
  // and withBarn creates this barn now — which sits in the *UTC* month, while the fixtures
  // below are placed by local-calendar anchor. In the hours where those two months differ,
  // an unbackdated barn would clamp MONTH away and every table below would read empty.
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

  seeded = { compedTier, apple, birch, comet, lease }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The month every fixture above lands in, derived from the same local-calendar anchor the
 * builders use rather than from `new Date()`. finances/page.tsx resolves its default month
 * from the server clock, so a spec must always pass `?month=` — and passing the *UTC*
 * current month would disagree with a `monthAnchor(0)` fixture during the hours when the
 * local and UTC months differ. Day 15 is far enough from either boundary that the anchor's
 * own UTC month is never in doubt.
 */
const MONTH = formatMonthParam(monthAnchor(0))

type Tab = (typeof NET_TABS)[number]

function financesUrl(tab?: Tab): string {
  return `/barn/${barn.slug}/finances?month=${MONTH}${tab ? `&tab=${tab}` : ''}`
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

/** A body row identified by its own first-column label, which is a plain cell or a link. */
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
    await expect(bodyRow(page, COMPED_TIER).locator('td').nth(NET_COL)).toHaveText(
      formatCurrency(-seeded.compedTier.instructor_cut)
    )
  })

  /**
   * Net, not Gross: the lesson's fee *is* zero, so its Gross contribution is $0 on every
   * tab and no Gross assertion could tell inclusion from omission. Its cut, however, lands
   * in every tab's barn-wide Expenses total, so each tab's Total Net drops by exactly the
   * cut — which is precisely "not dropped, and not clamped to zero".
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

  // resolveMemberNames renders the rider login's profile; exact so it can't also match the
  // managed stub "Test Rider2".
  const RIDER_NAME = 'Test Rider'

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

  // Split from the checkbox above: the row rendering and the row linking anywhere useful
  // are independently regressable. The heading wait is what makes "working" load-bearing —
  // a link to a dead agreement id would reach the same URL and render a 404 instead.
  test('horse_drilldown_charge_row_links_back_to_its_agreement @manager', async ({ page }) => {
    await page.goto(horseDrilldownUrl(seeded.apple.id))
    await leaseDrilldownRow(page).getByRole('link').click()
    await page.getByRole('heading', { name: 'Lease Detail' }).waitFor()
    await expect(page).toHaveURL(new RegExp(`/barn/${barn.slug}/agreements/${seeded.lease.id}\\?kind=lease$`))
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
  const TRAINER_NAME = 'Test Trainer'

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
    // Scoped to the page header rather than taken barn-wide: the Photo section renders a
    // second "Remove" whenever the member has a photo.
    await page
      .locator('main > div')
      .filter({ has: page.getByRole('heading', { level: 1 }) })
      .getByRole('button', { name: 'Remove' })
      .click()

    await expect(page).toHaveURL(new RegExp(`/barn/${barn.slug}/members$`))
  })

  // By membership id, not by name: an id can't be matched by some other member who happens
  // to share a first or last name with the removed one.
  test('removed_trainer_no_longer_appears_on_the_members_list @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/members`)
    await expect(
      page.locator(`a[href="/barn/${barn.slug}/members/${barn.data.members.trainer.membershipId}"]`)
    ).toHaveCount(0)
  })

  test('removed_instructors_lesson_fee_folds_into_by_instructor_unattributed @manager', async ({ page }) => {
    await page.goto(financesUrl('trainer'))
    expect(await cellMoney(footerRow(page, UNATTRIBUTED_ROW), GROSS_COL)).toBe(
      baselineUnattributedGross + removedTrainerGross
    )
  })

  // finances/page.tsx filters the NO_INSTRUCTOR_LABEL row out of the body and folds it into
  // the footer instead, so the fee reappearing as a "No instructor" row would mean it had
  // been counted twice over — once in the body and once in Unattributed.
  test('by_instructor_has_no_no_instructor_body_row_after_the_removal @manager', async ({ page }) => {
    await page.goto(financesUrl('trainer'))
    await expect(breakdownTable(page).locator('tbody tr').filter({ hasText: NO_INSTRUCTOR_LABEL })).toHaveCount(0)
  })

  test('by_instructor_unattributed_info_icon_explains_a_removed_instructor @manager', async ({ page }) => {
    await page.goto(financesUrl('trainer'))
    await footerRow(page, UNATTRIBUTED_ROW).getByRole('button', { name: 'Info' }).click()
    await expect(page.getByText(REMOVED_INSTRUCTOR_EXPLANATION)).toBeVisible()
  })
})
