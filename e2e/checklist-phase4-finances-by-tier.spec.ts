import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addLeaseCharge, addPaidLesson, addTier, monthAnchor } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import { formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import type { Agreement, LessonTier } from '@/lib/db/types'

// Typed into the tier edit form partway through the mixed-rate check, so it can't come from a
// builder. Every assertion about it is still expressed as this value plus a builder-returned
// one, never as a literal currency string. Deliberately different from every seeded tier's
// own cut, so `old + new` is distinguishable from `new × lesson count`.
const REVISED_INSTRUCTOR_CUT = 10

type Seeded = {
  /** Two paid lessons this month, so its Expenses cell is a genuine sum, not one lesson's cut. */
  advanced: LessonTier
  /** Collects income but has a zero instructor cut — the non-degenerate `—` case. */
  beginner: LessonTier
  /** The tier the mixed-rate check re-prices. */
  mixed: LessonTier
  /** No lessons in any month — the "still appears with $0.00" row, and part of the four-row
   *  #771 backfill that the empty-month check proves is not enough to keep the table visible. */
  novice: LessonTier
  chargeOnlyMonthCharge: Agreement
}

let seeded: Seeded

const barn = withBarn('phase4-finances-by-tier', async ({ supabase, barn, members }) => {
  // resolveFinancesMonth clamps any `?month=` older than the barn's own creation month up to
  // it, and withBarn creates this barn *now* — so without backdating, the empty month and the
  // charge-only month below would both silently resolve to the current month instead.
  mustSucceed(
    await supabase.from('barns').update({ created_at: monthAnchor(2).toISOString() }).eq('id', barn.id),
    'backdate barn created_at'
  )

  const advanced = await addTier(supabase, barn.id, { name: 'Advanced', price: 100, instructorCut: 30 })
  const beginner = await addTier(supabase, barn.id, { name: 'Beginner', price: 60, instructorCut: 0 })
  const mixed = await addTier(supabase, barn.id, { name: 'Mixed', price: 90, instructorCut: 40 })
  const novice = await addTier(supabase, barn.id, { name: 'Novice', price: 80, instructorCut: 25 })

  const apollo = await addHorse(supabase, barn.id, 'Apollo')

  // Every lesson is paid: getFinancialSummary's tier breakdown folds collected rows only, so
  // an unpaid lesson would contribute nothing and only muddy the Outstanding sections above.
  const paidLesson = (tier: LessonTier) =>
    addPaidLesson(supabase, barn, {
      monthsAgo: 0,
      instructorId: members.trainer.membershipId,
      horseIds: [apollo.id],
      riderIds: [members.rider2.membershipId],
      fee: tier.price,
      tierName: tier.name,
    })

  await paidLesson(advanced)
  await paidLesson(advanced)
  await paidLesson(beginner)
  await paidLesson(mixed)

  // monthsAgo 1 is deliberately left completely empty — no lesson, no charge — so By Tier's
  // EmptyState branch is reachable there despite the four active tiers above each producing a
  // $0.00 backfill row.

  // monthsAgo 2 gets one *collected* charge and nothing else: a charge has no tier, so every
  // tier row is $0.00 and the whole month's Gross lands in the footer's "Outside this view".
  const chargeOnlyMonthCharge = await addLeaseCharge(supabase, barn, {
    monthsAgo: 2,
    riderId: members.rider2.membershipId,
    horseId: apollo.id,
    fee: 150,
  })
  // What mark_agreement_charge_paid's body does, done directly: that RPC gates on
  // auth_is_barn_manager, which reads auth.uid() and so always fails for a service-role
  // client. getChargesForSummary reads the charge's *transaction*, not the charge row, so
  // this is the one write that makes the charge count as collected income for that month.
  mustSucceed(
    await supabase
      .from('transactions')
      .update({ collected: true, payment_type: 'venmo' })
      .eq('barn_id', barn.id)
      .not('agreement_charge_id', 'is', null),
    'collect the charge-only month charge'
  )

  seeded = { advanced, beginner, mixed, novice, chargeOnlyMonthCharge }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * finances/page.tsx resolves its default month from the server clock, so every navigation
 * here names its month explicitly. UTC arithmetic, because resolveFinancesMonth parses and
 * compares `?month=` in UTC.
 */
function monthParam(monthsAgo: number): string {
  const now = new Date()
  return formatMonthParam(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1)))
}

function byTierUrl(monthsAgo = 0): string {
  return `/barn/${barn.slug}/finances?month=${monthParam(monthsAgo)}&tab=tier`
}

/**
 * The breakdown table, as distinct from the Outstanding Income table that can also be on this
 * page: only a breakdown table carries a ReconciliationFoot, so `tfoot` is what tells them
 * apart. Everything below reads through this, so no assertion can drift onto the wrong table.
 */
function breakdownTable(page: Page) {
  return page.locator('main table:has(tfoot)')
}

/**
 * The sortable column headers, excluding each header's ⓘ trigger — SortableTh renders both as
 * <button> inside the same <th>, and only the sort control carries the column label.
 */
function sortHeaders(page: Page) {
  return breakdownTable(page).locator('thead th button:not([aria-label="Info"])')
}

/** Header labels with the sort indicator stripped — the column list, independent of sort state. */
async function columnLabels(page: Page): Promise<string[]> {
  const texts = await sortHeaders(page).allTextContents()
  return texts.map((text) => text.replace(/[▲▼]/g, '').trim())
}

/**
 * The headers currently carrying `indicator`, as a locator rather than as text already read
 * out — so the indicator assertions below are auto-retrying `toHaveText` calls and can't race
 * the client-side re-sort. Asserting the full match set (not just the expected header) is what
 * covers "and disappears from the previous column".
 */
function headersShowing(page: Page, indicator: '▲' | '▼') {
  return sortHeaders(page).filter({ hasText: indicator })
}

/** Every body row's cells as text, in render order — the row order the sort produced. */
function bodyRows(page: Page): Promise<string[][]> {
  return breakdownTable(page)
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? ''))
    )
}

/** Columns are Tier | Gross | Expenses | Net; every lookup below is by tier name, not index. */
const TIER = 0
const GROSS = 1
const EXPENSES = 2
const NET = 3

async function rowFor(page: Page, tierName: string): Promise<string[]> {
  const rows = await bodyRows(page)
  const row = rows.find((cells) => cells[TIER] === tierName)
  if (!row) throw new Error(`no By Tier row for "${tierName}" — rows were ${JSON.stringify(rows)}`)
  return row
}

/** Every breakdown table renders Expenses in accounting parens, so magnitude is the figure. */
function parseMoney(text: string): number {
  return Math.abs(Number(text.replace(/[^0-9.]/g, '')))
}

/** "Subtotal" and "Total" would both match a plain `hasText: 'Total'`; these rows are distinct. */
function footerRow(page: Page, label: string) {
  return breakdownTable(page).locator('tfoot tr').filter({ hasText: label })
}

/**
 * Taps a sort header and blocks until the indicator has settled on it.
 *
 * The wait is what makes the row-order tests below sound: sorting is client-side React state,
 * and click() resolves once the event is dispatched, not once the re-render has committed —
 * so bodyRows(), which reads through evaluateAll and therefore does not auto-retry, would
 * otherwise race it and read the pre-tap order. `settlesOn` is passed in rather than derived
 * from a tap counter so a caller that taps twice with a read in between still names the right
 * indicator for each tap.
 *
 * A wait, not an assertion — and used only by the two tests whose claim is about row order, so
 * it never pre-establishes what its caller goes on to assert. The two tests whose claim *is*
 * about the indicator assert it directly with a retrying `toHaveText` instead.
 */
async function tapSort(page: Page, label: string, settlesOn: '▲' | '▼') {
  await sortHeaders(page).filter({ hasText: label }).click()
  await headersShowing(page, settlesOn).filter({ hasText: label }).waitFor()
}

// ---------------------------------------------------------------------------
// The tab, its columns, and the figures in them
// ---------------------------------------------------------------------------

// Reached by the pill rather than by `&tab=tier`, so "still reachable via the pill" is
// load-bearing here rather than an untested half of the checkbox. The pill's own href omits
// `?month=` on the current month by design (finances/page.tsx's monthQ), which resolves to the
// month this test loaded explicitly.
//
// Asserted with toHaveText rather than by reading the cells into an array, because the pill is
// a client-side navigation: a plain read races the re-render and sees the By Horse table.
// Expecting them in ascending order couples this to the load-order sort, which
// by_tier_rows_load_sorted_by_tier_name_ascending below pins independently.
test('by_tier_tab_lists_every_barn_tier @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/finances?month=${monthParam(0)}`)
  await page.getByRole('link', { name: 'By Tier', exact: true }).click()
  await expect(breakdownTable(page).locator(`tbody tr td:nth-child(${TIER + 1})`)).toHaveText(
    [seeded.advanced.name, seeded.beginner.name, seeded.mixed.name, seeded.novice.name].sort()
  )
})

// Exact equality is what rules out the removed Price and Lessons-count columns — asserting
// only that the four expected labels are present would pass with either still in place.
test('by_tier_column_order_is_tier_gross_expenses_net @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  expect(await columnLabels(page)).toEqual(['Tier', 'Gross', 'Expenses', 'Net'])
})

// Advanced has two paid lessons, so a cell showing one lesson's cut — the bug this checkbox
// exists to catch — is distinguishable from the sum.
test('by_tier_expenses_column_sums_the_tiers_snapshotted_cuts @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  const row = await rowFor(page, seeded.advanced.name)
  expect(parseMoney(row[EXPENSES])).toBe(seeded.advanced.instructor_cut * 2)
})

// Beginner collected a lesson fee this month but carries a zero cut — the non-degenerate
// case, unlike a tier with no lessons at all, which would show `—` whatever the rule was.
test('by_tier_expenses_column_shows_a_dash_when_snapshotted_cuts_total_zero @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  const row = await rowFor(page, seeded.beginner.name)
  expect(row[EXPENSES]).toBe('—')
})

// Read off the DOM and compared to each other: the invariant is between the three rendered
// figures, so re-deriving any of them from the seed would only re-state the fixture.
test('by_tier_row_gross_equals_net_plus_expenses @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  const row = await rowFor(page, seeded.advanced.name)
  expect(parseMoney(row[GROSS])).toBe(parseMoney(row[NET]) + parseMoney(row[EXPENSES]))
})

// Novice never has a lesson, and Advanced/Beginner/Mixed all collected this month — so this
// is the "still appears alongside tiers that did collect" case, not an all-zero table.
test('tier_with_no_paid_lessons_still_appears_with_zero_gross_and_net @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  const row = await rowFor(page, seeded.novice.name)
  expect([row[GROSS], row[NET]]).toEqual([formatCurrency(0), formatCurrency(0)])
})

// ---------------------------------------------------------------------------
// #971 — the tab's empty state, and the charge-only month it must not swallow
// ---------------------------------------------------------------------------

// The barn has four active tiers, so #771's per-active-tier backfill hands this month four
// $0.00 rows. Asserting on the EmptyState copy rather than on the table's absence pins the
// branch that actually rendered — page.tsx renders exactly one of the two.
test('by_tier_shows_empty_state_in_a_month_with_no_collected_income @manager', async ({ page }) => {
  await page.goto(byTierUrl(1))
  await expect(page.getByText('Lesson income will appear here once lessons are added.')).toBeVisible()
})

test('by_tier_shows_its_table_in_a_charge_only_month @manager', async ({ page }) => {
  await page.goto(byTierUrl(2))
  await expect(sortHeaders(page).filter({ hasText: 'Tier' })).toBeVisible()
})

// A charge belongs to no tier, so in a month whose only income is one charge the entire Gross
// has to surface in the footer rather than in any row — the reconciliation #971 added.
test('charge_only_month_gross_appears_in_the_outside_this_view_footer_row @manager', async ({ page }) => {
  await page.goto(byTierUrl(2))
  const gross = footerRow(page, 'Outside this view').locator('td').nth(GROSS)
  await expect(gross).toHaveText(formatCurrency(seeded.chargeOnlyMonthCharge.fee))
})

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

// Sort state is client-side and does not survive a navigation, so these are independent tests
// that each re-tap from a fresh load rather than a serial chain sharing one page.

test('by_tier_rows_load_sorted_by_tier_name_ascending @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  const names = (await bodyRows(page)).map((cells) => cells[TIER])
  expect(names).toEqual([...names].sort())
})

// Matching the whole ▲ set, not just the Tier header, asserts both halves of the checkbox at
// once: that the indicator is on Tier, and that it is on nothing else.
test('by_tier_tier_header_carries_the_ascending_indicator_on_load @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  await expect(headersShowing(page, '▲')).toHaveText(['Tier ▲'])
})

test('tapping_the_net_header_sorts_by_net_ascending @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  await tapSort(page, 'Net', '▲')
  const nets = (await bodyRows(page)).map((cells) => parseMoney(cells[NET]))
  expect(nets).toEqual([...nets].sort((a, b) => a - b))
})

// Clicked directly rather than through tapSort: the indicator is this checkbox's whole claim,
// so waiting for it first would leave the assertion with nothing left to catch.
test('tapping_the_net_header_moves_the_ascending_indicator_to_net @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  await sortHeaders(page).filter({ hasText: 'Net' }).click()
  await expect(headersShowing(page, '▲')).toHaveText(['Net ▲'])
})

test('tapping_the_net_header_twice_reverses_the_order @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  await tapSort(page, 'Net', '▲')
  const ascending = (await bodyRows(page)).map((cells) => cells[TIER])
  await tapSort(page, 'Net', '▼')
  expect((await bodyRows(page)).map((cells) => cells[TIER])).toEqual([...ascending].reverse())
})

// First tap goes through tapSort so the second one can't land before the first has been
// applied; the second is a bare click for the same reason as the test above — ▼ is the claim.
test('tapping_the_net_header_twice_flips_the_indicator_to_descending @manager', async ({ page }) => {
  await page.goto(byTierUrl())
  await tapSort(page, 'Net', '▲')
  await sortHeaders(page).filter({ hasText: 'Net' }).click()
  await expect(headersShowing(page, '▼')).toHaveText(['Net ▼'])
})

// ---------------------------------------------------------------------------
// Re-pricing a tier's instructor cut
// ---------------------------------------------------------------------------

// Declared last because it is the only test here that mutates the barn: it re-prices the
// Mixed tier and books a lesson under the new rate, which changes that tier's Gross/Expenses
// /Net for every test that reads them afterwards.
//
// The tier is re-priced through the real settings form — the manager action the checkbox
// describes — but the second lesson is booked through the fixture builder, because
// create_lesson_with_participants is what snapshots the cut onto the lesson
// (COALESCE(lesson_tiers.instructor_cut, barns.default_instructor_cut)) and the builder calls
// that same RPC. Driving the new-lesson form instead would exercise more form, not more of
// the snapshotting rule under test.
test('by_tier_expenses_column_mixes_old_and_new_instructor_cut_rates @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/settings/tiers/${seeded.mixed.id}`)
  await page.locator('#tier-instructor-cut').fill(String(REVISED_INSTRUCTOR_CUT))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/settings$`), { timeout: 15000, waitUntil: 'commit' })

  const { supabase, barn: barnRow, members } = barn.data
  await addPaidLesson(supabase, barnRow, {
    monthsAgo: 0,
    instructorId: members.trainer.membershipId,
    horseIds: [(await addHorse(supabase, barnRow.id, 'Blaze')).id],
    riderIds: [members.rider2.membershipId],
    fee: seeded.mixed.price,
    tierName: seeded.mixed.name,
  })

  await page.goto(byTierUrl())
  const row = await rowFor(page, seeded.mixed.name)
  // seeded.mixed.instructor_cut is the pre-edit rate the first lesson snapshotted; the sum of
  // the two distinct rates is what separates correct behaviour from `new rate × lesson count`.
  expect(parseMoney(row[EXPENSES])).toBe(seeded.mixed.instructor_cut + REVISED_INSTRUCTOR_CUT)
})
